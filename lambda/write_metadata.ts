import { DynamoDB } from 'aws-sdk';
import { S3Event } from 'aws-lambda';

const dynamodb = new DynamoDB.DocumentClient();
const tableName = process.env.TABLE_NAME || '';

export const handler = async (event: S3Event): Promise<void> => {
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = record.s3.object.key;
    const size = record.s3.object.size;
    const extension = key.split('.').pop();
    const uploadTime = new Date().toISOString();

    await dynamodb.put({
      TableName: tableName,
      Item: {
        FileName: key,
        Size: size,
        Extension: extension,
        UploadTime: uploadTime
      }
    }).promise();
  }
};