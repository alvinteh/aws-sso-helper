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
5. Run `node index.js --file <file> --endpoint <scim_endpoint> --token <access_token>` to run the script. The `endpoint`, `token` and `log` level options can also be passed through environment variables.

## Remarks

The helper script performs little in the way of validation. In addition, only 5 SCIM attributes (`givenName`, `familyName`, `displayName`, `email` and `userName`) are currently populated.

The script can also be run as a Lambda function. Ensure your function's execution role has read access to the S3 bucket with the CSV file, set the `endpoint`, `token` and `log` level options environment variables in Lambda, and invoke the function with an event with the `bucket` and `file` properties (i.e. `{ bucket: 'my-bucket', file: 'my-users.csv' }`).

