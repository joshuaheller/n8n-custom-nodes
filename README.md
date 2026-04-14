# n8n-nodes-vat-validator

An [n8n](https://n8n.io) community node that validates EU VAT numbers using the official [VIES (VAT Information Exchange System)](https://ec.europa.eu/taxation_customs/vies/) SOAP API provided by the European Commission.

---

## Features

- Validates any EU VAT number against the live VIES database
- Returns company name and address for valid VAT numbers
- Auto-detects the country code from the VAT number prefix
- Graceful error handling for network failures and invalid inputs
- No external HTTP library required — uses Node's built-in `https` module

---

## Supported Country Codes

| Code | Country        | Code | Country       |
|------|----------------|------|---------------|
| AT   | Austria        | IT   | Italy         |
| BE   | Belgium        | LT   | Lithuania     |
| BG   | Bulgaria       | LU   | Luxembourg    |
| CY   | Cyprus         | LV   | Latvia        |
| CZ   | Czech Republic | MT   | Malta         |
| DE   | Germany        | NL   | Netherlands   |
| DK   | Denmark        | PL   | Poland        |
| EE   | Estonia        | PT   | Portugal      |
| EL   | Greece         | RO   | Romania       |
| ES   | Spain          | SE   | Sweden        |
| FI   | Finland        | SI   | Slovenia      |
| FR   | France         | SK   | Slovakia      |
| HR   | Croatia        | XI   | Northern Ireland |
| HU   | Hungary        |      |               |
| IE   | Ireland        |      |               |

---

## Installation

### In your n8n instance (recommended)

1. Go to **Settings → Community Nodes**
2. Click **Install a community node**
3. Enter `n8n-nodes-vat-validator` and click **Install**

### Manual installation

```bash
# Inside your n8n custom nodes directory
npm install n8n-nodes-vat-validator
```

Or clone and link locally:

```bash
git clone https://github.com/your-username/n8n-nodes-vat-validator.git
cd n8n-nodes-vat-validator
npm install
npm run build
```

Then in your n8n instance, set the `N8N_CUSTOM_EXTENSIONS` environment variable to point to the package directory.

---

## Usage

1. Add the **VAT Validator** node to your workflow
2. Fill in the required fields:

| Field        | Description                                                                 |
|--------------|-----------------------------------------------------------------------------|
| VAT Number   | The EU VAT ID to validate, including the country prefix (e.g. `DE123456789`) |
| Country Code | 2-letter EU country code. Leave blank to auto-detect from the VAT prefix.   |

---

## Output

The node returns the following JSON for each input item:

```json
{
  "vatNumber": "DE123456789",
  "countryCode": "DE",
  "isValid": true,
  "companyName": "Example GmbH",
  "companyAddress": "Musterstraße 1, 10115 Berlin",
  "checkedAt": "2024-01-15T12:00:00.000Z"
}
```

When a VAT number is **invalid**:

```json
{
  "vatNumber": "DE000000000",
  "countryCode": "DE",
  "isValid": false,
  "companyName": null,
  "companyAddress": null,
  "checkedAt": "2024-01-15T12:00:00.000Z"
}
```

When a **network or API error** occurs, an additional `error` field is included:

```json
{
  "vatNumber": "DE123456789",
  "countryCode": "DE",
  "isValid": false,
  "companyName": null,
  "companyAddress": null,
  "checkedAt": "2024-01-15T12:00:00.000Z",
  "error": "Network error: VIES API request timed out after 15 seconds"
}
```

---

## Development

```bash
# Install dependencies
npm install

# Build once
npm run build

# Watch mode (rebuilds on file changes)
npm run dev
```

---

## Notes

- The VIES API is a public EU service and may occasionally be unavailable or rate-limited. The node has a **15-second timeout** per request.
- Some EU member states may mark their VIES service as temporarily unavailable; in such cases the API returns a SOAP fault which is surfaced in the `error` field.
- VAT numbers are validated against the **live VIES database** — results reflect the current registration status.

---

## License

MIT
