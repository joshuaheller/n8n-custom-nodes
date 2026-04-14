"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.VatValidator = void 0;
const n8n_workflow_1 = require("n8n-workflow");
const https = __importStar(require("https"));
const VIES_ENDPOINT = 'https://ec.europa.eu/taxation_customs/vies/services/checkVatService';
const EU_COUNTRY_CODES = new Set([
    'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'ES',
    'FI', 'FR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT',
    'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK', 'XI',
]);
function buildSoapEnvelope(countryCode, vatNumber) {
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
function extractXmlValue(xml, tag) {
    const re = new RegExp(`<(?:[^:>]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[^:>]+:)?${tag}>`, 'i');
    const match = xml.match(re);
    if (!match)
        return null;
    const value = match[1].trim();
    return value === '---' || value === '' ? null : value;
}
function postSoap(body) {
    return new Promise((resolve, reject) => {
        const url = new URL(VIES_ENDPOINT);
        const options = {
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
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        });
        req.on('error', reject);
        req.setTimeout(15000, () => {
            req.destroy(new Error('VIES API request timed out after 15 seconds'));
        });
        req.write(body);
        req.end();
    });
}
function stripCountryPrefix(vatNumber, countryCode) {
    const upper = vatNumber.toUpperCase().replace(/\s+/g, '');
    if (upper.startsWith(countryCode.toUpperCase())) {
        return upper.slice(countryCode.length);
    }
    return upper;
}
function inferCountryCode(vatNumber) {
    return vatNumber.trim().toUpperCase().slice(0, 2);
}
class VatValidator {
    constructor() {
        this.description = {
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
                    required: true,
                    placeholder: 'DE',
                    description: '2-letter EU country code. Leave blank to auto-detect from the VAT number prefix.',
                },
            ],
        };
    }
    async execute() {
        var _a;
        const items = this.getInputData();
        const results = [];
        for (let i = 0; i < items.length; i++) {
            const rawVatNumber = this.getNodeParameter('vatNumber', i).trim();
            let countryCode = this.getNodeParameter('countryCode', i).trim().toUpperCase();
            if (!rawVatNumber) {
                throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'VAT Number must not be empty.', { itemIndex: i });
            }
            // Auto-detect country code from VAT number prefix when not provided
            if (!countryCode) {
                countryCode = inferCountryCode(rawVatNumber);
            }
            if (!EU_COUNTRY_CODES.has(countryCode)) {
                throw new n8n_workflow_1.NodeOperationError(this.getNode(), `"${countryCode}" is not a recognised EU country code. Supported codes: ${[...EU_COUNTRY_CODES].join(', ')}`, { itemIndex: i });
            }
            const vatNumberOnly = stripCountryPrefix(rawVatNumber, countryCode);
            const checkedAt = new Date().toISOString();
            try {
                const soapBody = buildSoapEnvelope(countryCode, vatNumberOnly);
                const responseXml = await postSoap(soapBody);
                // Check for SOAP fault
                if (responseXml.includes('<faultcode>') || responseXml.includes(':Fault>')) {
                    const faultString = (_a = extractXmlValue(responseXml, 'faultstring')) !== null && _a !== void 0 ? _a : 'Unknown SOAP fault';
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
            }
            catch (error) {
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
exports.VatValidator = VatValidator;
//# sourceMappingURL=VatValidator.node.js.map