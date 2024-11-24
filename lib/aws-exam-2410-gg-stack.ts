import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';

export class AwsExam2410GgStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

     // S3 Bucket
     const bucket = new s3.Bucket(this, 'Exam-GG-Bucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      lifecycleRules: [{ expiration: cdk.Duration.days(1) }]
    });
    // DynamoDB Table
      const table = new dynamodb.Table(this, 'Exam-GG-Table', {
      partitionKey: { name: 'FileName', type: dynamodb.AttributeType.STRING }
    });

    // SNS Topic
       const topic = new sns.Topic(this, 'Exam-GG-Topic');
        topic.addSubscription(new subscriptions.EmailSubscription('petkoff83@gmail.com'));



    // Lambda Function to Write Metadata to DynamoDB
      const writeMetadataFunction = new lambda.Function(this, 'WriteMetadataFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'write_metadata.handler',
      code: lambda.Code.fromAsset('lambda')
    });

    // Grant the Lambda function write permissions to the DynamoDB table
      table.grantWriteData(writeMetadataFunction);

    // Lambda Function to Check Upload Status, Send Email, and Delete Old Files
      const checkUploadFunction = new lambda.Function(this, 'CheckUploadFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'check_upload.handler',
      code: lambda.Code.fromAsset('lambda'),
      environment: {
        TOPIC_ARN: topic.topicArn,
        BUCKET_NAME: bucket.bucketName
      }
    });

    // Grant the Lambda function publish permissions to the SNS topic and delete permissions to the S3 bucket
      topic.grantPublish(checkUploadFunction);
      bucket.grantDelete(checkUploadFunction);

    // Add S3 event notification to trigger the Lambda function
      bucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(writeMetadataFunction));

    // EC2 Instance
      const vpc = new ec2.Vpc(this, 'Exam-GG-Vpc', { maxAzs: 2 });
      const instance = new ec2.Instance(this, 'Exam-GG-Instance', {
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux2(), 
      vpc,
      userData: ec2.UserData.custom(`
        #!/bin/bash
        yum update -y
        yum install -y httpd php
        systemctl start httpd
        systemctl enable httpd

        mkdir -p /var/www/html/upload/uploads
        chown -R ec2-user:apache /var/www/html/upload
        chmod 2775 /var/www/html/upload
        find /var/www/html/upload -type d -exec chmod 2775 {} \\;
        find /var/www/html/upload -type f -exec chmod 0664 {} \\;

        echo '<!DOCTYPE html>
        <html>
        <head>
            <title>File Upload</title>
        </head>
        <body>
            <h1>Upload a File</h1>
            <form action="upload.php" method="post" enctype="multipart/form-data">
                <input type="file" name="fileToUpload" id="fileToUpload">
                <input type="submit" value="Upload File" name="submit">
            </form>
        </body>
        </html>' > /var/www/html/upload/index.html

        echo '<?php
        $target_dir = "/var/www/html/upload/uploads/";
        $target_file = $target_dir . basename($_FILES["fileToUpload"]["name"]);
        $uploadOk = 1;
        $fileType = strtolower(pathinfo($target_file, PATHINFO_EXTENSION));

        // Check if file type is allowed
        if($fileType != "jpg" && $fileType != "png" && $fileType != "pdf") {
            echo "Sorry, only JPG, PNG & PDF files are allowed.";
            $uploadOk = 0;
        }

        // Check if $uploadOk is set to 0 by an error
        if ($uploadOk == 0) {
            echo "Sorry, your file was not uploaded.";
        // if everything is ok, try to upload file
        } else {
            if (move_uploaded_file($_FILES["fileToUpload"]["tmp_name"], $target_file)) {
                echo "The file ". htmlspecialchars(basename($_FILES["fileToUpload"]["name"])). " has been uploaded.";
            } else {
                echo "Sorry, there was an error uploading your file.";
            }
        }
        ?>' > /var/www/html/upload/upload.php
      `)
    });
    

    // Add IAM Role to EC2 Instance
    instance.role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'));
    instance.role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AWSLambdaExecute'));

    // Output the S3 bucket name
    new cdk.CfnOutput(this, 'BucketName', { value: bucket.bucketName });
  }
}
