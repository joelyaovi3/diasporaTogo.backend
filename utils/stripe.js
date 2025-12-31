import Stripe from 'stripe';

class StripeService {
   constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
      timeout: 30000, // Augmenter à 30 secondes
      maxNetworkRetries: 2, // Ajouter des retry automatiques
    });
  }

  async retrievePaymentIntent(paymentIntentId) {
    try {
      console.log(`🔍 Récupération PaymentIntent: ${paymentIntentId}`);
      const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId, {
        expand: ['payment_method'] // Ajouter pour debug
      });
      console.log(`✅ PaymentIntent récupéré: ${paymentIntent.status}`);
      return paymentIntent;
    } catch (error) {
      console.error('❌ Erreur retrievePaymentIntent:', error.message);
      console.error('Code:', error.code, 'Type:', error.type);
      throw error;
    }
  }

  async confirmPaymentIntent(paymentIntentId, options = {}) {
    try {
      console.log(`🔍 Confirmation PaymentIntent: ${paymentIntentId}`);
      
      const defaultOptions = {
        payment_method: 'pm_card_visa',
        return_url: process.env.FRONTEND_URL ? 
          `${process.env.FRONTEND_URL}/payment-complete` : 
          'http://localhost:3000/payment-complete',
        expand: ['payment_method', 'latest_charge'] // Pour debug
      };
      
      const finalOptions = { ...defaultOptions, ...options };
      const confirmedIntent = await this.stripe.paymentIntents.confirm(paymentIntentId, finalOptions);
      
      console.log(`✅ PaymentIntent confirmé: ${confirmedIntent.status}`);
      return confirmedIntent;
    } catch (error) {
      console.error('❌ Erreur confirmPaymentIntent:', error.message);
      console.error('Code:', error.code, 'Type:', error.type);
      throw error;
    }
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