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
}

export default new StripeService();