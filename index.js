const fs = require('fs');

const { program } = require('commander');
const parse = require('csv-parse');
const got = require('got');
const winston = require('winston');

// Set up program options
program
    .option('-f, --file <file>', 'CSV file containing users to sync', '')
    .option('-e, --endpoint <scim_endpoint>', 'AWS SSO SCIM endpoint', process.env.endpoint)
    .option('-t, --token <access_token>', 'AWS SSO Access Token', process.env.token)
    .option('-l, --log <log_level>', 'Logging level (error/warn/info)', process.env.log || 'info');
program.parse(process.argv);

const options = program.opts();

// Set up logger
const logger = winston.createLogger({
    level: options.log,
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.combine(
                    winston.format.colorize({
                        all: true
                    }),
                    winston.format.timestamp({
                        format: 'YY-MM-DD HH:MM:SS'
                    }),
                    winston.format.printf(
                        info => ` ${info.timestamp} ${info.level}: ${info.message}`
                    )
                ),
            )
        })
    ],
});

const run = async (csv) => {
    const ssoUsers = await getUsers();
    const csvUsers = await parseCSVString(csv);

    return syncUsers(ssoUsers, csvUsers);
};

const parseCSVString = async (csvString) => {
    logger.info(`Parsing CSV string.`);

    return await new Promise((resolve) => {
        try {
            const records = [];
            
            parse(csvString.trim(), { columns: true, trim: true, skip_empty_lines: true })
                .on('data', (record) => {
                    records.push(record);
                })
                .on('end', () => {
                    resolve(records);
                });
        }
        catch (error) {
            logger.error(`Error parsing CSV file`, error);
        }
    });
};

const parseCSVFile = async (filename) => {
    logger.info(`Parsing CSV file ${filename}.`);

    return await new Promise((resolve) => {
        const records = [];
        
        try {
            fs.createReadStream(filename)
                .pipe(parse({ columns: true, trim: true, skip_empty_lines: true }))
                .on('data', (record) => {
                    records.push(record);
                })
                .on('end', () => {
                    resolve(records);
                });
        }
        catch (error) {
            logger.error(`Error parsing CSV file`, error);
        }
    });
};

const getUsers = async () => {
    logger.info('Getting users');

    try {
        const { body } = await got.get(`${options.endpoint}/Users`, {
            headers: {
                'Authorization': `Bearer ${options.token}`
            },
            responseType: 'json'
        });

        logger.info(`Got ${body.totalResults} user(s)`);

        return body.Resources;
    }
    catch (error) {
        logger.error(`Error getting users`, error);
    }
};

const syncUsers = async (ssoUsers, csvUsers) => {
    logger.info(`Syncing user(s).`);

    const ssoUserEmails = ssoUsers.map((ssoUser) => {
        return ssoUser.userName.toLowerCase();
    });

    const csvUserEmails = csvUsers.map((csvUser) => {
        return csvUser.email.toLowerCase();
    });

    const userCreations = [];
    const userDeletions = [];

    csvUsers.forEach((csvUser) => {
        // Create users if they do not exist in SSO
        if (ssoUserEmails.indexOf(csvUser.email.toLowerCase()) === -1) {
            userCreations.push(createUser(csvUser));
        }
    });

    ssoUsers.forEach((ssoUser) => {
        // Delete users if they do not exist in CSV
        if (csvUserEmails.indexOf(ssoUser.userName.toLowerCase()) === -1) {
            userDeletions.push(deleteUser(ssoUser));
        }
    });

    const userCreationResults = await Promise.all(userCreations);
    const userDeletionResults = await Promise.all(userDeletions);

    let userCreationSuccesses = 0;
    let userDeletionSuccesses = 0;

    userCreationResults.forEach((userCreationResult) => { 
        if (!(userCreationResult instanceof Error)) {
            userCreationSuccesses++;
        }
    });

    userDeletionResults.forEach((userDeletionResult) => { 
        if (!(userDeletionResult instanceof Error)) {
            userDeletionSuccesses++;
        }
    });

    const response = `Completed creating ${userCreationSuccesses}/${userCreations.length} ` +
        `and deleting ${userDeletionSuccesses}/${userDeletions.length} user(s).`;
    
    logger.info(response);
    return response;
};

const createUser = async (csvUser) => {
    return new Promise(async (resolve, reject) => {
        logger.info('Creating user', csvUser);

        // Perform basic validation for the required fields
        const isFieldValid = (field) => {
            return csvUser[field] && !!(csvUser[field].trim());
        }

        if (!isFieldValid('givenName') ||
            !isFieldValid('familyName') ||
            !isFieldValid('displayName') ||
            !isFieldValid('email')) {
            // Ignore users with invalid field value(s)
            const errorMessage = 'Ignoring user due to invalid field value(s).'
            logger.warning(errorMessage, csvUser);

            reject(new Error(`${errorMessage} ${JSON.stringify(csvUser)}`));
        }

        const userObject = {
            // externalId is not required 
            // externalId: '',
            userName: csvUser.email,
            name: {
            familyName: csvUser.familyName,
            givenName: csvUser.givenName,
            },
            displayName: csvUser.displayName,
            emails: [
            {
                value: csvUser.email,
                type: 'work',
                primary: true
            }
            ],
            active: true
        }

        try {
            const { body } = await got.post(`${options.endpoint}/Users`, {
                headers: {
                    'Authorization': `Bearer ${options.token}`
                },
                json: userObject,
                responseType: 'json'
            });

            csvUser.id = body.id;

            logger.info(`Created user ${csvUser.id}`, csvUser);

            resolve(csvUser);
        }
        catch (error) {
            if (error.response && error.response.statusCode === 409) {
                const errorMessage = `Error creating user ${JSON.stringify(csvUser)} due to conflicting user.`;
                logger.error(errorMessage);
                reject(new Error(errorMessage));
            }
            else {
                const errorMessage = `Error creating user ${JSON.stringify(csvUser)}`;
                logger.error(errorMessage, error);
                reject(new Error(errorMessage));
            }
        }
    });
};

const deleteUser = async (ssoUser) => {
    return new Promise(async (resolve, reject) => {
        logger.info('Deleting user', ssoUser);

        try {
            const { body } = await got.delete(`${options.endpoint}/Users/${ssoUser.id}`, {
                headers: {
                    'Authorization': `Bearer ${options.token}`
                },
                responseType: 'json'
            });

            logger.info(`Deleted user ${ssoUser.id}`, ssoUser);

            resolve(null);
        }
        catch (error) {
            if (error.response && error.response.statusCode === 404) {
                const errorMessage = `Error deleting user ${JSON.stringify(ssoUser)} due to the specified user not existing.`;
                logger.error(errorMessage);
                reject(new Error(errorMessage));
            }
            else {
                const errorMessage = `Error deleting user ${JSON.stringify(ssoUser)}`;
                logger.error(errorMessage, error);
                reject(new Error(errorMessage));
            }
        }
    });
};

module.exports.handler = async (event, context) => {
    return await run(event.data);
};