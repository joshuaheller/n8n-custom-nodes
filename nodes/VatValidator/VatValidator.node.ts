import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';
import * as https from 'https';

const VIES_ENDPOINT = 'https://ec.europa.eu/taxation_customs/vies/services/checkVatService';

const EU_COUNTRY_CODES = new Set([
	'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'ES',
	'FI', 'FR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT',
	'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK', 'XI',
]);

function buildSoapEnvelope(countryCode: string, vatNumber: string): string {
	return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope
  xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:urn="urn:ec.europa.eu:taxud:vies:services:checkVat:types">
  <soapenv:Header/>
  <soapenv:Body>
    <urn:checkVat>
      <urn:countryCode>${countryCode}</urn:countryCode>
      <urn:vatNumber>${vatNumber}</urn:vatNumber>
    </urn:checkVat>
  </soapenv:Body>
</soapenv:Envelope>`;
}

function extractXmlValue(xml: string, tag: string): string | null {
	const re = new RegExp(`<(?:[^:>]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[^:>]+:)?${tag}>`, 'i');
	const match = xml.match(re);
	if (!match) return null;
	const value = match[1].trim();
	return value === '---' || value === '' ? null : value;
}

function postSoap(body: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const url = new URL(VIES_ENDPOINT);
		const options: https.RequestOptions = {
			hostname: url.hostname,
			path: url.pathname,
			method: 'POST',
			headers: {
				'Content-Type': 'text/xml;charset=UTF-8',
				'SOAPAction': '',
				'Content-Length': Buffer.byteLength(body),
			},
		};

		const req = https.request(options, (res) => {
			const chunks: Buffer[] = [];
			res.on('data', (chunk: Buffer) => chunks.push(chunk));
			res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
		});

		req.on('error', reject);
		req.setTimeout(15_000, () => {
			req.destroy(new Error('VIES API request timed out after 15 seconds'));
		});

		req.write(body);
		req.end();
	});
}

function stripCountryPrefix(vatNumber: string, countryCode: string): string {
	const upper = vatNumber.toUpperCase().replace(/\s+/g, '');
	if (upper.startsWith(countryCode.toUpperCase())) {
		return upper.slice(countryCode.length);
	}
	return upper;
}

function inferCountryCode(vatNumber: string): string {
	return vatNumber.trim().toUpperCase().slice(0, 2);
}

export class VatValidator implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'VAT Validator',
		name: 'vatValidator',
		// Use a built-in n8n icon or a simple unicode character as fallback
		icon: 'fa:check-circle',
		group: ['transform'],
		version: 1,
		description: 'Validates EU VAT numbers via the official VIES API',
		defaults: {
			name: 'VAT Validator',
			color: '#1F8B4C',
		},
		inputs: ['main'],
		outputs: ['main'],
		properties: [
			{
				displayName: 'VAT Number',
				name: 'vatNumber',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'DE123456789',
				description: 'The EU VAT number to validate, including the 2-letter country prefix (e.g. DE123456789)',
			},
			{
				displayName: 'Country Code',
				name: 'countryCode',
				type: 'string',
				default: '',
				placeholder: 'DE',
				description: '2-letter EU country code. Leave blank to auto-detect from the VAT number prefix.',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const results: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			const rawVatNumber = (this.getNodeParameter('vatNumber', i) as string).trim();
			let countryCode = (this.getNodeParameter('countryCode', i) as string).trim().toUpperCase();

			if (!rawVatNumber) {
				throw new NodeOperationError(this.getNode(), 'VAT Number must not be empty.', { itemIndex: i });
			}

			// Auto-detect country code from VAT number prefix when not provided
			if (!countryCode) {
				countryCode = inferCountryCode(rawVatNumber);
			}

			if (!EU_COUNTRY_CODES.has(countryCode)) {
				throw new NodeOperationError(
					this.getNode(),
					`"${countryCode}" is not a recognised EU country code. Supported codes: ${[...EU_COUNTRY_CODES].join(', ')}`,
					{ itemIndex: i },
				);
			}

			const vatNumberOnly = stripCountryPrefix(rawVatNumber, countryCode);
			const checkedAt = new Date().toISOString();

			try {
				const soapBody = buildSoapEnvelope(countryCode, vatNumberOnly);
				const responseXml = await postSoap(soapBody);

				// Check for SOAP fault
				if (responseXml.includes('<faultcode>') || responseXml.includes(':Fault>')) {
					const faultString = extractXmlValue(responseXml, 'faultstring') ?? 'Unknown SOAP fault';
					results.push({
						json: {
							vatNumber: rawVatNumber,
							countryCode,
							isValid: false,
							companyName: null,
							companyAddress: null,
							checkedAt,
							error: faultString,
						},
					});
					continue;
				}

				const validRaw = extractXmlValue(responseXml, 'valid');
				const isValid = validRaw === 'true';
				const companyName = isValid ? extractXmlValue(responseXml, 'name') : null;
				const companyAddress = isValid ? extractXmlValue(responseXml, 'address') : null;

				results.push({
					json: {
						vatNumber: rawVatNumber,
						countryCode,
						isValid,
						companyName,
						companyAddress,
						checkedAt,
					},
				});
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				results.push({
					json: {
						vatNumber: rawVatNumber,
						countryCode,
						isValid: false,
						companyName: null,
						companyAddress: null,
						checkedAt,
						error: `Network error: ${message}`,
					},
				});
			}
		}

		return [results];
	}
}
