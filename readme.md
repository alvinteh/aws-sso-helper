# aws-sso-helper

This utility script helps create/delete users in AWS SSO based on a supplied CSV file.

## Prerequisites

* AWS account with SSO setup with an external identity source and SCIM provisioning enabled.
* node 14.16.0+

## Get Started

1. Clone this repository.
2. Install the node dependencies by running `npm install`.
3. Obtain your AWS SSO SCIM endpoint and access token.
    1. Log in to the AWS console.
    2. Navigate to AWS SSO.
    3. Click on "Settings" in the left navigation pane.
    4. Click on the "View details" link for the "Provisioning" section.
    5. Note down the SCIM endpoint.
    6. Click on "Generate New Token" and note down the access token.
4. Prepare a CSV file. Ensure it has the columns `displayName`, `givenName`, `familyName` and `email` (which will be used as the username). The order of the columns does not matter.
5. Run `node index.js --file <file> --endpoint <scim_endpoint> --token <access_token>` to run the script.

## Remarks

The helper script performs little in the way of validation. In addition, only 5 SCIM attributes (`givenName`, `familyName`, `displayName`, `email` and `userName`) are currently populated.
