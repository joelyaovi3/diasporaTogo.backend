import Stripe from 'stripe';

class StripeService {
  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
    });
  }

  async createCustomer(user) {
    return await this.stripe.customers.create({
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
      phone: user.phoneNumber,
      metadata: {
        userId: user._id.toString(),
        userType: user.userType,
        source: 'registration'
      }
    });
  }

  async createPaymentIntent(customerId, user) {
    return await this.stripe.paymentIntents.create({
      amount: 500,
      currency: 'eur',
      customer: customerId,
      metadata: {
        userId: user._id.toString(),
        email: user.email,
        userType: user.userType,
        purpose: 'account_verification'
      },
      description: `Vérification compte ${user.userType} - ${user.username}`,
      automatic_payment_methods: {
        enabled: true,
      },
    });
  }
  async retrievePaymentIntent(paymentIntentId) {
    try {
      return await this.stripe.paymentIntents.retrieve(paymentIntentId);
    } catch (error) {
      console.error('❌ Erreur retrievePaymentIntent:', error.message);
      throw error;
    }
  }

  async confirmPaymentIntent(paymentIntentId, options = {}) {
    try {
      const defaultOptions = {
        payment_method: 'pm_card_visa', // Pour les tests
        return_url: process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/payment-complete` : 'http://localhost:3000/payment-complete'
      };
      
      const finalOptions = { ...defaultOptions, ...options };
      return await this.stripe.paymentIntents.confirm(paymentIntentId, finalOptions);
    } catch (error) {
      console.error('❌ Erreur confirmPaymentIntent:', error.message);
      throw error;
    }
  }

  async isPaymentSucceeded(paymentIntentId) {
    try {
      const paymentIntent = await this.retrievePaymentIntent(paymentIntentId);
      return paymentIntent.status === 'succeeded';
    } catch (error) {
      return false;
    }
  }
}

export default new StripeService();