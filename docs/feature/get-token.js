#!/usr/bin/env node

/**
 * Helper script to get Beatport access token manually
 */

console.log(`
🎵 Beatport MCP Server - Manual Token Setup

Since Beatport's API requires OAuth2 credentials that aren't publicly available,
you'll need to extract an access token from your browser session.

📋 Step-by-Step Instructions:

1. 🌐 Open your browser and go to: https://beatport.com
2. 🔐 Log in with your Beatport account
3. 🛠️  Open Developer Tools (F12 or Cmd+Option+I)
4. 📡 Go to the Network tab
5. 🔄 Navigate to any page on Beatport (like browse tracks)
6. 🔍 Look for API requests to 'api.beatport.com'
7. 📄 Click on one of these requests
8. 📋 In the Headers section, find 'Authorization: Bearer ...'
9. 📝 Copy the token (the part after 'Bearer ')

🔧 Then set it as an environment variable:

export BEATPORT_ACCESS_TOKEN="your_token_here"

Or create a .env file with:
BEATPORT_ACCESS_TOKEN=your_token_here

⚠️  Note: This token will expire (usually after a few hours/days)
and you'll need to repeat this process.

🚀 Once you have the token, run:
npm start

📞 For a permanent solution, contact Beatport at:
engineering@beatport.com

Ask for OAuth2 credentials for "Beatport MCP Server"
`);

// Check if token is already set
if (process.env.BEATPORT_ACCESS_TOKEN) {
  console.log('\n✅ BEATPORT_ACCESS_TOKEN is set!');
  console.log('Token length:', process.env.BEATPORT_ACCESS_TOKEN.length);
  console.log('First 10 chars:', process.env.BEATPORT_ACCESS_TOKEN.substring(0, 10) + '...');
} else {
  console.log('\n❌ BEATPORT_ACCESS_TOKEN not found in environment');
}
