import * as cdk from 'aws-cdk-lib';
import { BackendStack } from '../stack-configuration';

const app = new cdk.App();

new BackendStack(app, 'TestionRetailStack', {
    description: 'TestionRetail Backend Infrastructure',
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT || '334624057595',
        region: process.env.CDK_DEFAULT_REGION || 'eu-west-2',
    },
});

app.synth();
