# ReimbursementTracker - Free HMO Reimbursement Tracker

Track HMO reimbursements with a Custom GPT + Google Sheets. Send receipt photos, app screenshots, or HMO emails and the GPT automatically logs and tracks your claims.

## Features

- 📸 **4 Input Types**: Receipt photos, app screenshots, HMO emails, bank screenshots
- 🔄 **Smart Duplicate Detection**: Automatically detects and updates existing claims
- 📊 **Benefit Limits Tracking**: Monitor usage vs limits (monthly/quarterly/annual)
- 🏦 **Payment Matching**: Match bank credits to approved claims
- 📋 **Reference Data**: Configurable benefit types, claim types, and sources

## Quick Start

### 1. Copy the Template Spreadsheet

Click the link below to create your own copy:

> **[📋 Make a Copy](https://docs.google.com/spreadsheets/d/TEMPLATE_ID/copy)** *(replace TEMPLATE_ID with your template)*

### 2. Run Quick Setup

1. Open your copied spreadsheet
2. Click **📋 ReimbursementTracker → 🚀 Quick Setup (New Users)**
3. Grant permissions when prompted
4. All sheets will be created automatically

### 3. Deploy as Web App

1. Go to **Extensions → Apps Script**
2. Click **Deploy → New deployment**
3. Set type to **Web app**
4. Set "Who has access" to **Anyone**
5. Click **Deploy** and copy the URL

### 4. Create Your Custom GPT

1. Go to [chat.openai.com](https://chat.openai.com) → Create a GPT
2. **Instructions**: Copy the contents of `RT_INSTRUCTIONS.md`
3. **Knowledge**: Upload `RT_KNOWLEDGE_BASE.txt`
4. **Actions**: Copy `rt_openapi.yaml` and replace the deployment URL with yours
5. **Privacy Policy**: `https://jimsteven.github.io/reimbursement-tracker/privacy-policy.html`

### 5. Set Your Benefit Limits

In the **BenefitLimits** sheet, update column C (Limit) with your actual HMO limits. The Period column (D) supports:

| Period | Calculates |
|--------|-----------|
| `annual` | Current year usage |
| `quarterly` | Current quarter (Q1-Q4) |
| `monthly` | Current month only |

## Spreadsheet Sheets

| Sheet | Purpose |
|-------|---------|
| **Reimbursements** | All claims with 21 columns (status, amounts, dates, receipt numbers) |
| **ReferenceData** | Source of truth for Source, BenefitType, ClaimType |
| **BenefitLimits** | Limit tracking with auto-calculating Used & Remaining formulas |

## How It Works

### Flow

```
📸 Send image → GPT extracts data → Duplicate check → Confirm → Log to sheet
```

1. **Receipt** → Creates pending claim (extracts receipt number)
2. **App Screenshot** → Updates existing claim with ClaimID + approval status
3. **HMO Email** → Updates with approved amounts and remarks
4. **Bank Screenshot** → Matches payment to approved claims → marks as paid

### Status Progression

```
🟡 Pending → 🟢 Approved → 🔵 Paid
         ↘ 🟠 Lacking
         ↘ 🔴 Denied
```

## API Actions

| Action | Description |
|--------|-------------|
| `rtAddReimbursement` | Log a new claim |
| `rtCheckDuplicate` | Check for existing claims before logging |
| `rtUpdateStatus` | Update any fields on an existing claim |
| `rtListReimbursements` | List claims with filters |
| `rtGetSummary` | View totals by benefit/status |
| `rtGetReferenceData` | Get valid benefit types, claim types |
| `rtAddReferenceItem` | Add new reference data |
| `rtGetBenefitUsage` | Check usage vs limits |
| `rtUpdateBenefitLimit` | Set/update a benefit limit |

## Benefit Types

| Type | Display Name |
|------|-------------|
| `maternity_assistance` | Maternity Assistance |
| `medicine_reimbursement` | Medicine (Confinement) |
| `pet_support` | Pet Support Program |
| `optical` | Optical Benefit |
| `psychology_sessions` | Psychology Sessions |
| `dental_reimbursement` | Dental (Provincial) |

## Claim Types

| Code | Description |
|------|-------------|
| OT | Outpatient Treatment |
| OL | Outpatient Lab |
| DP | Dental Procedure |
| APE | Annual Physical Exam |
| PS | Pet Support |
| OP | Optical |
| PY | Psychology |
| MT | Maternity |
| MR | Medicine Reimbursement |

## Custom GPT Setup

### Sharing Your GPT

If you want others to use your Custom GPT:

1. Each user needs their **own spreadsheet** (copy the template)
2. Each user needs their **own web app deployment** (different URL)
3. Each user creates their **own Custom GPT** with their deployment URL
4. OR share the GPT publicly but users must update the Actions URL

### Files to Configure

| File | Where it goes |
|------|--------------|
| `RT_INSTRUCTIONS.md` | GPT Instructions field |
| `RT_KNOWLEDGE_BASE.txt` | Upload as Knowledge file |
| `rt_openapi.yaml` | Actions schema (update deployment URL) |

## Privacy

All data is stored in **your own Google Spreadsheet**. No external databases. See the [Privacy Policy](https://jimsteven.github.io/reimbursement-tracker/privacy-policy.html).

## License

Free to use. MIT License.
