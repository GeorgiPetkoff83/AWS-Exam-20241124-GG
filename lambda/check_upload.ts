import { SNS, S3 } from 'aws-sdk';
import { S3Event } from 'aws-lambda';

const sns = new SNS();
const s3 = new S3();
const topicArn = process.env.TOPIC_ARN || '';
const bucketName = process.env.BUCKET_NAME || '';

export const handler = async (event: S3Event): Promise<void> => {
  const now = new Date().getTime();
  const thirtyMinutes = 30 * 60 * 1000;

  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = record.s3.object.key;
    const size = record.s3.object.size;
    const extension = key.split('.').pop();
    const uploadTime = record.eventTime;

    // Send email notification
    const message = `File uploaded: ${key}\nSize: ${size} bytes\nExtension: ${extension}\nUpload Time: ${uploadTime}`;
    await sns.publish({
      TopicArn: topicArn,
      Message: message,
      Subject: 'File Upload Notification'
    }).promise();

    // List objects in the bucket
    const objects = await s3.listObjectsV2({ Bucket: bucketName }).promise();

    // Delete objects older than 30 minutes
    for (const object of objects.Contents || []) {
      const objectAge = now - new Date(object.LastModified || '').getTime();
      if (objectAge > thirtyMinutes) {
        await s3.deleteObject({ Bucket: bucketName, Key: object.Key || '' }).promise();
      }
    }
  }
};