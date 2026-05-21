import axios from 'axios';

const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY || '';
const PAYMONGO_PUBLIC_KEY = process.env.PAYMONGO_PUBLIC_KEY || '';
const PAYMONGO_BASE_URL = 'https://api.paymongo.com/v1';

function hasValidPaymongoKeys() {
  return PAYMONGO_SECRET_KEY && 
         PAYMONGO_SECRET_KEY.startsWith('sk_') && 
         PAYMONGO_SECRET_KEY.length > 10;
}

function getBasicAuthHeader() {
  const credentials = Buffer.from(`${PAYMONGO_SECRET_KEY}:`).toString('base64');
  return `Basic ${credentials}`;
}

export async function createCheckoutSession({ amount, description, referenceNumber, successUrl, cancelUrl }) {
  if (!hasValidPaymongoKeys()) {
    return {
      success: false,
      error: 'Paymongo API keys not configured. Please contact the administrator.',
    };
  }

  try {
    const payload = {
      data: {
        attributes: {
          line_items: [
            {
              name: description,
              amount: Math.round(amount * 100),
              quantity: 1,
              currency: 'PHP',
            },
          ],
          payment_method_types: ['qrph'],
          send_email_receipt: true,
          show_description: true,
          description,
          reference_number: referenceNumber,
          success_url: successUrl,
          cancel_url: cancelUrl,
        },
      },
    };

    console.log('createCheckoutSession - Payload:', payload);

    const response = await axios.post(`${PAYMONGO_BASE_URL}/checkout_sessions`, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: getBasicAuthHeader(),
      },
    });

    console.log('createCheckoutSession - PayMongo Response:', response.data);

    return {
      success: true,
      paymentLinkUrl: response.data.data.attributes.checkout_url,
      paymentLinkId: response.data.data.id,
    };
  } catch (error) {
    console.error('Paymongo createCheckoutSession error:', error.response?.data || error.message);
    const errorDetail = error.response?.data?.errors?.[0]?.detail;
    return {
      success: false,
      error: errorDetail || 'Failed to create checkout session. Please try again or contact support.',
    };
  }
}

export async function retrieveCheckoutSession(checkoutSessionId) {
  try {
    const response = await axios.get(`${PAYMONGO_BASE_URL}/checkout_sessions/${checkoutSessionId}`, {
      headers: {
        Authorization: getBasicAuthHeader(),
      },
    });

    console.log('retrieveCheckoutSession - response:', response.data.data);

    return {
      success: true,
      checkoutSession: response.data.data,
    };
  } catch (error) {
    console.error('Paymongo retrieveCheckoutSession error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.errors?.[0]?.detail || 'Failed to retrieve checkout session',
    };
  }
}

export async function getPaymentsByCheckoutSessionId(checkoutSessionId) {
  try {
    const v1BaseUrl = 'https://api.paymongo.com/v1';
    const response = await axios.get(`${v1BaseUrl}/payments`, {
      headers: {
        Authorization: getBasicAuthHeader(),
      },
    });

    console.log('getPaymentsByCheckoutSessionId - all payments:', response.data?.data?.map(p => ({ id: p.id, attributes: p.attributes })));

    const matchingPayments = response.data.data.filter(
      (payment) => 
        payment.attributes?.checkout_session_id === checkoutSessionId || 
        (typeof payment.attributes?.payment_intent === 'object' && payment.attributes?.payment_intent?.id === checkoutSessionId) ||
        payment.attributes?.payment_intent === checkoutSessionId ||
        payment.attributes?.source?.id === checkoutSessionId
    );

    console.log('getPaymentsByCheckoutSessionId - matching payments:', matchingPayments);

    return {
      success: true,
      payments: matchingPayments,
    };
  } catch (error) {
    console.error('Paymongo getPaymentsByCheckoutSessionId error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.errors?.[0]?.detail || 'Failed to get payments for session',
    };
  }
}

export async function createPaymentLink({ amount, description, referenceNumber, successUrl, cancelUrl }) {
  return createCheckoutSession({ amount, description, referenceNumber, successUrl, cancelUrl });
}

export async function retrievePaymentLink(paymentLinkId) {
  return retrieveCheckoutSession(paymentLinkId);
}

export async function getPaymentBySourceId(sourceId) {
  return getPaymentsByCheckoutSessionId(sourceId);
}

export async function retrievePaymentIntent(paymentIntentId) {
  try {
    const v1BaseUrl = 'https://api.paymongo.com/v1';
    const response = await axios.get(`${v1BaseUrl}/payment_intents/${paymentIntentId}`, {
      headers: {
        Authorization: getBasicAuthHeader(),
      },
    });

    console.log('retrievePaymentIntent - response:', response.data.data);

    return {
      success: true,
      paymentIntent: response.data.data,
    };
  } catch (error) {
    console.error('Paymongo retrievePaymentIntent error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.errors?.[0]?.detail || 'Failed to retrieve payment intent',
    };
  }
}

export async function getPaymentsByPaymentLinkId(paymentLinkId) {
  return getPaymentsByCheckoutSessionId(paymentLinkId);
}
