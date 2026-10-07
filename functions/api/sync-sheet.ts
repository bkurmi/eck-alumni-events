// Cloudflare Pages Function: /api/sync-sheet
// Appends a registration row to Google Sheets via Google Service Account (JWT auth using Web Crypto)

interface Env {
  GOOGLE_CLIENT_EMAIL?: string;
  GOOGLE_PRIVATE_KEY?: string;
  GOOGLE_SHEET_ID?: string;
}

interface RegistrationPayload {
  event_slug?: string;
  registration_number: string;
  name: string;
  mobile: string;
  email?: string;
  address: string;
  city: string;
  state: string;
  year_of_passing: number | string;
  engineering_discipline: string;
  organization?: string;
  employment_type?: string;
  industry_domain?: string;
  professional_category: string;
  work_location?: string;
  attendance_status: string;
  number_of_attendees: number;
  amount: number;
  screenshot_url?: string;
  google_sheet_id?: string;
}

// Convert PEM private key to CryptoKey
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const cleanPem = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\\n/g, '')
    .replace(/\s+/g, '');

  const binaryDer = Uint8Array.from(atob(cleanPem), (c) => c.charCodeAt(0));

  return crypto.subtle.importKey(
    'pkcs8',
    binaryDer.buffer,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: { name: 'SHA-256' },
    },
    false,
    ['sign']
  );
}

// Base64URL encoder
function base64UrlEncode(str: string): string {
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlEncodeBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Create Signed JWT for Google Service Account
async function createGoogleJwt(clientEmail: string, privateKeyPem: string): Promise<string> {
  const header = JSON.stringify({ alg: 'RS256', typ: 'JWT' });
  const now = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  });

  const encodedHeader = base64UrlEncode(header);
  const encodedPayload = base64UrlEncode(payload);
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const cryptoKey = await importPrivateKey(privateKeyPem);
  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signatureInput)
  );

  const encodedSignature = base64UrlEncodeBuffer(signatureBuffer);
  return `${signatureInput}.${encodedSignature}`;
}

// Exchange JWT for Access Token
async function getGoogleAccessToken(jwt: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Google OAuth error: ${res.status} - ${errorText}`);
  }

  const data: any = await res.json();
  return data.access_token;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body: RegistrationPayload = await context.request.json();
    const env = context.env;

    const sheetId = body.google_sheet_id || env.GOOGLE_SHEET_ID;
    const clientEmail = env.GOOGLE_CLIENT_EMAIL;
    const privateKey = env.GOOGLE_PRIVATE_KEY;

    if (!sheetId || !clientEmail || !privateKey) {
      console.warn('Google Sheets sync skipped: missing environment variables or Sheet ID.');
      return new Response(
        JSON.stringify({
          success: false,
          skipped: true,
          message: 'Google Sheets sync skipped: missing credentials.',
        }),
        {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // 1. Authenticate with Google
    const jwt = await createGoogleJwt(clientEmail, privateKey);
    const accessToken = await getGoogleAccessToken(jwt);

    // 2. Prepare row matching Section 6 table columns:
    // Registration | Name | Mobile | Email | Address | City | State | Year | Discipline | Organization | Category | Work Location | Attendance | People | Amount | Screenshot
    const rowValues = [
      body.registration_number,
      body.name,
      body.mobile,
      body.email || '',
      body.address,
      body.city,
      body.state,
      body.year_of_passing,
      body.engineering_discipline,
      body.organization || '',
      body.professional_category,
      body.work_location || '',
      body.attendance_status === 'yes' ? 'Yes' : body.attendance_status === 'maybe' ? 'Maybe' : 'No',
      body.number_of_attendees || 1,
      body.amount > 0 ? `₹${body.amount}` : '₹0',
      body.screenshot_url || '',
    ];

    // 3. Append to Sheet1
    const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Sheet1!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
    const sheetRes = await fetch(appendUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [rowValues],
      }),
    });

    if (!sheetRes.ok) {
      const errText = await sheetRes.text();
      console.error('Failed to append row to Google Sheet:', errText);
      return new Response(
        JSON.stringify({ success: false, error: errText }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Row appended successfully to Google Sheet.' }),
      { headers: { 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    console.error('Error in /api/sync-sheet:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
