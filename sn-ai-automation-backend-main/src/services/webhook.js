import axios from "axios";

export async function sendWebhook(event, data) {
  const webhookUrl = process.env.WEBHOOK_URL;
  
  if (!webhookUrl) {
    console.log("No webhook URL configured");
    return;
  }

  try {
    await axios.post(webhookUrl, {
      event,
      timestamp: new Date().toISOString(),
      data
    }, {
      timeout: 5000
    });

    console.log(`Webhook sent for event: ${event}`);
  } catch (err) {
    console.error("Webhook delivery failed:", err.message);
  }
}