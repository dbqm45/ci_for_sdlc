import type { DesignFrame, DocumentItem, ProjectContext, RequirementItem } from '../model.js';

/**
 * Demo workspace "Checkout" — a realistic, deliberately imperfect product
 * definition used for demos, tests and onboarding. It reproduces the examples
 * from the product concept (PAY-125 Retry payment, duplicate charge bug,
 * timeout conflict, missing Figma states, story ↔ task gaps …).
 */

const JIRA = 'https://demo.atlassian.net/browse/';
const WIKI = 'https://demo.atlassian.net/wiki/spaces';
const FIGMA_FILE = 'FIGCHK01';
const figmaUrl = (node: string) => `https://www.figma.com/design/${FIGMA_FILE}/Checkout-App?node-id=${node.replace(':', '-')}`;

function issue(p: Partial<RequirementItem> & Pick<RequirementItem, 'key' | 'type' | 'title'>): RequirementItem {
  return {
    description: '',
    acceptanceCriteria: [],
    businessRules: [],
    status: 'To Do',
    labels: [],
    components: [],
    links: [],
    remoteLinks: [],
    updatedAt: '2026-09-28T10:00:00.000Z',
    url: JIRA + p.key,
    ...p,
  };
}

function page(p: Omit<DocumentItem, 'url'> & { url?: string }): DocumentItem {
  return { url: `${WIKI}/${p.space}/pages/${p.id}`, ...p };
}

function frame(id: string, pageName: string, name: string, texts: string[], transitions: string[] = [], updatedAt = '2026-09-20T09:00:00.000Z'): DesignFrame {
  return { id, fileKey: FIGMA_FILE, fileName: 'Checkout App', page: pageName, name, texts, transitions, updatedAt, url: figmaUrl(id) };
}

export function demoProject(): ProjectContext {
  const requirements: RequirementItem[] = [
    // ------------------------------------------------------------ epics
    issue({
      key: 'PAY-100',
      type: 'epic',
      title: 'Saved Payment Methods',
      components: ['Payments'],
      description:
        'Goal: returning customers can store and manage cards so that checkout takes less time. Expected outcome: 30% of returning customers pay with a saved card within 3 months (success metric tracked in Amplitude).',
      remoteLinks: [`${WIKI}/PAY/pages/2001`],
    }),
    issue({
      key: 'PAY-110',
      type: 'epic',
      title: 'Payment Reliability',
      components: ['Payments'],
      description: 'Improvements around failed payments, retries and declines.',
    }),
    issue({
      key: 'CHK-200',
      type: 'epic',
      title: 'Checkout Experience',
      components: ['Checkout'],
      description: 'Goal: reduce checkout abandonment from 22% to 15% by making order placement faster and clearer.',
    }),
    issue({
      key: 'ACC-300',
      type: 'epic',
      title: 'Customer Profile',
      components: ['Account'],
      description: 'Profile related work.',
    }),

    // ------------------------------------------------------------ saved payment methods
    issue({
      key: 'PAY-123',
      type: 'story',
      title: 'Save payment method',
      epicKey: 'PAY-100',
      components: ['Payments'],
      status: 'Ready for Dev',
      description: 'As a logged-in customer I want to save a card to my account so that I can pay faster next time.',
      acceptanceCriteria: [
        'The user enters card number, expiry date and CVV and clicks "Save card".',
        'The "Save card" button is disabled while saving to prevent duplicate cards.',
        'Invalid card details show an inline validation message next to the field.',
        'On success the message "Card saved" is shown and the card appears in My saved cards.',
        'If saving fails, an error message is shown and the entered data stays in the form.',
        'If the payment service does not respond within 30 seconds, a timeout message is shown.',
        'If the session expired, the user is redirected to sign in and returns to the form afterwards.',
        'If the device is offline, an offline message is shown and nothing is saved.',
        'If the user leaves the page before saving, nothing is stored.',
      ],
      businessRules: ['A customer can store a maximum of 5 cards.'],
      remoteLinks: [figmaUrl('1:1'), `${WIKI}/PAY/pages/2001`],
      updatedAt: '2026-09-25T12:00:00.000Z',
    }),
    issue({
      key: 'PAY-124',
      type: 'story',
      title: 'Delete saved card',
      epicKey: 'PAY-100',
      components: ['Payments'],
      status: 'Refinement',
      description: 'As a customer I want to delete a saved card so that I can remove cards I no longer use.',
      acceptanceCriteria: [
        'The user can delete a saved card from the saved cards list.',
        'The card disappears from the list after deletion.',
        'If deletion fails, an error message is shown and the card stays in the list.',
      ],
      remoteLinks: [figmaUrl('1:9')],
    }),
    issue({ key: 'PAY-131', type: 'task', title: 'Integrate DELETE /payment-methods endpoint', parentKey: 'PAY-124', components: ['Payments'], description: 'Call the delete endpoint for the selected saved card.' }),
    issue({ key: 'PAY-132', type: 'task', title: 'Remove deleted card from the saved cards list UI', parentKey: 'PAY-124', components: ['Payments'], description: 'Update the list after deletion so the card disappears.' }),

    // ------------------------------------------------------------ payment reliability
    issue({
      key: 'PAY-125',
      type: 'story',
      title: 'Retry payment',
      epicKey: 'PAY-110',
      components: ['Payments'],
      status: 'Refinement',
      description: 'As a customer whose payment failed I want to retry the payment so that I can still complete my order.',
      acceptanceCriteria: [
        'When a payment fails, the error screen shows a "Retry" button.',
        'Clicking "Retry" submits the payment again with the same card.',
        'While retrying, a loading indicator is shown and the "Retry" button is disabled.',
        'On success, the payment successful screen with the order number is shown.',
      ],
      remoteLinks: [figmaUrl('2:3'), `${WIKI}/PAY/pages/1001`],
      links: [{ type: 'relates to', key: 'PAY-127' }],
    }),
    issue({
      key: 'PAY-126',
      type: 'story',
      title: 'Payment confirmation',
      epicKey: 'PAY-110',
      components: ['Payments'],
      status: 'Ready for Dev',
      description: 'As a customer I want to see a confirmation after payment so that I know my order is placed.',
      acceptanceCriteria: ['The payment successful screen shows the order number and the paid amount.', 'The customer receives a receipt e-mail within 5 minutes.'],
      remoteLinks: [figmaUrl('2:4'), `${WIKI}/PAY/pages/1001`],
    }),
    issue({
      key: 'PAY-127',
      type: 'bug',
      title: 'Customer charged twice after retrying a failed payment',
      epicKey: 'PAY-110',
      components: ['Payments'],
      status: 'Open',
      description:
        'Steps to reproduce:\n1. Pay for an order with a card while the payment provider is slow.\n2. Payment screen shows "Payment failed".\n3. Click Retry.\n\nExpected: one charge.\nActual: duplicate charge — the customer is charged twice.',
      bug: { stepsToReproduce: '1. Pay for an order while the provider is slow. 2. Payment fails. 3. Click Retry.', expected: 'One charge.', actual: 'Customer is charged twice.' },
      links: [{ type: 'relates to', key: 'PAY-125' }],
    }),
    issue({
      key: 'PAY-128',
      type: 'story',
      title: 'Retry declined card payments',
      epicKey: 'PAY-110',
      components: ['Payments'],
      description: 'As a customer whose card was declined I want to try again so that a temporary decline does not block my purchase.',
      acceptanceCriteria: ['The user can retry a declined card payment up to 3 times.', 'After the 3rd attempt the user is asked to choose a different payment method.', 'The decline reason returned by the provider is shown above the Retry button.'],
      remoteLinks: [`${WIKI}/PAY/pages/1003`],
      links: [{ type: 'is blocked by', key: 'PAY-125' }],
    }),

    // ------------------------------------------------------------ checkout
    issue({
      key: 'CHK-201',
      type: 'story',
      title: 'Place order',
      epicKey: 'CHK-200',
      components: ['Checkout'],
      status: 'Ready for Dev',
      description: 'As a shopper I want to place my order so that I receive my products.',
      acceptanceCriteria: [
        'The order is submitted when the user clicks "Place order".',
        'The button is disabled while submitting.',
        'If the order service does not respond within 45 seconds, a timeout message is shown with a link to the order history.',
        'If the order cannot be created, an error message is shown and the cart is kept.',
        'On success the order confirmed screen is shown.',
      ],
      remoteLinks: [figmaUrl('3:1'), `${WIKI}/CHK/pages/3001`],
    }),
    issue({
      key: 'CHK-202',
      type: 'story',
      title: 'Order status after payment',
      epicKey: 'CHK-200',
      components: ['Checkout'],
      description: 'As a shopper I want to know the result of my payment so that I know if my order is paid.',
      acceptanceCriteria: ['The user receives an immediate confirmation after submitting the order.', 'The order confirmed screen shows the payment status "Paid".', 'If the payment is declined, an error message is shown.'],
      remoteLinks: [`${WIKI}/PAY/pages/1001`, figmaUrl('3:3')],
    }),
    issue({
      key: 'CHK-203',
      type: 'story',
      title: 'Apply promo code',
      epicKey: 'CHK-200',
      components: ['Checkout'],
      status: 'Ready for Dev',
      description: 'As a shopper I want to apply a promo code so that I get the advertised discount.',
      acceptanceCriteria: [
        'The user enters a promo code in the order summary and clicks "Apply".',
        'A valid code is successfully applied and the discount is shown in the order summary.',
        'An invalid or expired code shows the inline validation message "This code is not valid".',
        'If the promotion service fails, the message "Promo codes are unavailable right now" is shown and checkout continues without discount.',
        'The "Apply" button shows a spinner while the code is checked.',
      ],
      businessRules: ['Only one promo code per order.'],
      remoteLinks: [figmaUrl('4:1'), `${WIKI}/CHK/pages/3002`],
    }),
    issue({
      key: 'CHK-204',
      type: 'story',
      title: 'Choose saved card at checkout',
      epicKey: 'CHK-200',
      components: ['Checkout'],
      description: "As a returning shopper I want to pick one of my saved cards at checkout so that I don't have to type card details again.",
      acceptanceCriteria: ['Saved cards are listed with brand and last 4 digits.', 'The default card is preselected.', 'If the customer has no saved cards, the new card form is shown instead.'],
    }),

    // ------------------------------------------------------------ account
    issue({
      key: 'ACC-301',
      type: 'story',
      title: 'Upload profile photo',
      epicKey: 'ACC-300',
      components: ['Account'],
      description: 'As a customer I want to upload a profile photo so that my account feels personal.',
      acceptanceCriteria: ['The user can upload a JPG or PNG image as profile photo.', 'The new photo is shown in the header after upload.'],
      remoteLinks: [`${WIKI}/ACC/pages/4001`],
    }),
  ];

  const documents: DocumentItem[] = [
    page({
      id: '1001',
      title: 'Payment Architecture',
      space: 'PAY',
      labels: ['payments', 'architecture'],
      updatedAt: '2026-08-12T08:00:00.000Z',
      body: `Overview of the payment flow used by checkout (PAY-125, PAY-126).
Payments are processed asynchronously: POST /payments returns 202 Accepted and the final status is delivered via webhook. The client polls GET /payments/{id}/status until the payment is final.
The payment API timeout is 30 seconds.
Endpoint details: see Payments API Reference.
Card data never touches our servers; the client tokenizes the card with the payment provider.`,
    }),
    page({
      id: '1002',
      title: 'Payments API Reference',
      space: 'PAY',
      labels: ['payments', 'api'],
      updatedAt: '2026-07-30T08:00:00.000Z',
      body: `POST /payments — creates a charge attempt for an order. The endpoint accepts repeated requests; every request creates a new charge attempt.
GET /payments/{id}/status — returns PENDING, SUCCEEDED or FAILED.
Errors: 402 card declined, 409 order already paid, 5xx provider unavailable.`,
    }),
    page({
      id: '1003',
      title: 'Retry Policy (2025)',
      space: 'PAY',
      labels: ['payments'],
      updatedAt: '2025-03-04T08:00:00.000Z',
      body: `Card payments may be retried an unlimited number of times by the customer.
The retry timeout is 60 seconds.
Note: this page is superseded by Payment Failure Handling.`,
    }),
    page({
      id: '1004',
      title: 'Payment Failure Handling',
      space: 'PAY',
      labels: ['payments'],
      updatedAt: '2026-09-02T08:00:00.000Z',
      body: `Declined cards: show the decline reason returned by the provider and let the customer choose another payment method.
Technical failures (timeouts, provider 5xx) are handled by the client application.`,
    }),
    page({
      id: '2001',
      title: 'Saved Payment Methods – Business Rules',
      space: 'PAY',
      labels: ['payments'],
      updatedAt: '2026-09-10T08:00:00.000Z',
      body: `Applies to PAY-123 and PAY-124.
A customer can store a maximum of 5 cards.
Card details are validated (Luhn check, expiry date in the future) before saving.
Deleting the default card makes the most recently added card the default.
Saving a card calls POST /payment-methods; the payment service timeout is 30 seconds.`,
    }),
    page({
      id: '3001',
      title: 'Checkout API',
      space: 'CHK',
      labels: ['checkout', 'api'],
      updatedAt: '2026-06-18T08:00:00.000Z',
      body: `POST /orders creates an order from the cart.
Order requests time out after 30 seconds.
Errors: 409 cart changed, 422 item out of stock, 5xx order service unavailable.`,
    }),
    page({
      id: '3002',
      title: 'Promotions Rules',
      space: 'CHK',
      labels: ['checkout'],
      updatedAt: '2026-05-11T08:00:00.000Z',
      body: `Promo codes are case-insensitive. Only one promo code per order.
Expired codes are rejected with a validation message. Promo validation calls GET /promotions/{code}.`,
    }),
    page({
      id: '4001',
      title: 'Profile & Account',
      space: 'ACC',
      labels: ['account'],
      updatedAt: '2026-04-01T08:00:00.000Z',
      body: `Profile photos: JPG or PNG, file upload limit 10 MB, stored in the media service.
Customers can change their e-mail and password in Account settings.`,
    }),
  ];

  const frames: DesignFrame[] = [
    // Saved cards
    frame('1:1', 'Saved cards', 'Add card / Default', ['Card number', 'Expiry date', 'CVV', 'Save card'], ['1:2', '1:3']),
    frame('1:2', 'Saved cards', 'Add card / Loading', ['Saving card…']),
    frame('1:3', 'Saved cards', 'Add card / Validation error', ['Card number is invalid']),
    frame('1:4', 'Saved cards', 'Add card / Error', ["We couldn't save your card"]),
    frame('1:5', 'Saved cards', 'Add card / Success', ['Card saved']),
    frame('1:6', 'Saved cards', 'Add card / Timeout', ['This is taking longer than expected']),
    frame('1:7', 'Saved cards', 'Add card / Offline', ['You are offline']),
    frame('1:8', 'Saved cards', 'Add card / Session expired', ['Please sign in again']),
    frame('1:9', 'Saved cards', 'Saved cards / List', ['My saved cards', 'Visa •••• 4242', 'Delete']),
    frame('1:10', 'Saved cards', 'Saved cards / Empty', ['No saved cards yet']),
    // Payment
    frame('2:1', 'Payment', 'Payment / Review', ['Total', 'Pay now'], ['2:3', '2:4']),
    frame('2:3', 'Payment', 'Payment / Error', ['Payment failed', 'Retry'], ['2:4']),
    frame('2:4', 'Payment', 'Payment / Success', ['Payment successful', 'Order number', 'Paid amount']),
    // Checkout
    frame('3:1', 'Checkout', 'Checkout / Place order', ['Order summary', 'Place order'], ['3:2']),
    frame('3:2', 'Checkout', 'Checkout / Submitting', ['Placing your order…'], ['3:3', '3:4', '3:5']),
    frame('3:3', 'Checkout', 'Checkout / Order confirmed', ['Order confirmed', 'Payment status: Paid']),
    frame('3:4', 'Checkout', 'Checkout / Timeout', ['Your order is taking longer than expected', 'View order history']),
    frame('3:5', 'Checkout', 'Checkout / Error', ["We couldn't place your order", 'Your cart was kept']),
    // Promo
    frame('4:1', 'Promo code', 'Promo / Default', ['Promo code', 'Apply'], ['4:2']),
    frame('4:2', 'Promo code', 'Promo / Loading', ['Checking code…']),
    frame('4:3', 'Promo code', 'Promo / Applied (success)', ['Discount applied']),
    frame('4:4', 'Promo code', 'Promo / Invalid code', ['This code is not valid']),
    frame('4:5', 'Promo code', 'Promo / Service error', ['Promo codes are unavailable right now']),
  ];

  return { project: { key: 'CHK', name: 'Checkout' }, requirements, documents, frames, fetchedAt: new Date().toISOString() };
}

/** Change scenarios for demonstrating continuous drift detection. */
export const DEMO_SCENARIOS: { id: string; title: string; description: string; apply: (ctx: ProjectContext) => void }[] = [
  {
    id: 'timeout-change',
    title: 'Confluence: payment timeout 30 s → 60 s',
    description: 'An architect updates "Payment Architecture" and "Saved Payment Methods – Business Rules" to a 60 second timeout.',
    apply: (ctx) => {
      for (const d of ctx.documents) {
        if (d.id === '1001' || d.id === '2001') {
          d.body = d.body.replace(/timeout is 30 seconds/g, 'timeout is 60 seconds');
          d.updatedAt = new Date().toISOString();
        }
      }
    },
  },
  {
    id: 'figma-remove-error',
    title: 'Figma: "Add card / Error" frame removed',
    description: 'A designer cleans up the Saved cards page and deletes the error frame.',
    apply: (ctx) => {
      ctx.frames = ctx.frames.filter((f) => f.id !== '1:4');
      const f = ctx.frames.find((x) => x.id === '1:1');
      if (f) f.updatedAt = new Date().toISOString();
    },
  },
  {
    id: 'story-card-limit',
    title: 'Jira: PAY-123 allows 10 saved cards',
    description: 'The product owner changes the business rule of PAY-123 without updating Confluence.',
    apply: (ctx) => {
      const r = ctx.requirements.find((x) => x.key === 'PAY-123');
      if (r) {
        r.businessRules = ['A customer can store a maximum of 10 cards.'];
        r.updatedAt = new Date().toISOString();
      }
    },
  },
  {
    id: 'backlog-intake',
    title: 'Jira: new backlog items arrive',
    description: 'Product adds a gift wrapping epic with draft stories and QA files a well-formed bug, before refinement.',
    apply: (ctx) => {
      const now = new Date().toISOString();
      ctx.requirements.push(
        issue({ key: 'GFT-400', type: 'epic', title: 'Gift Wrapping', components: ['Gifts'], description: 'Goal: offer gift wrapping at checkout so that gift orders grow by 10%.', updatedAt: now }),
        issue({ key: 'GFT-401', type: 'story', title: 'Choose wrapping paper', epicKey: 'GFT-400', components: ['Gifts'], description: 'Wrapping paper picker on the gift step.', updatedAt: now }),
        issue({
          key: 'GFT-402',
          type: 'story',
          title: 'Print gift message',
          epicKey: 'GFT-400',
          components: ['Gifts'],
          description: 'As a buyer I want to add a gift message so that the recipient knows who sent the gift. If the printer is offline the user can try again.',
          acceptanceCriteria: ['The message preview appears quickly.', 'The message is printed on the gift card.'],
          updatedAt: now,
        }),
        issue({ key: 'GFT-410', type: 'epic', title: 'Gift Registry', components: ['Gifts'], description: 'Goal: let customers share a wish list so that registry orders reach 5% of gift orders.', updatedAt: now }),
        issue({
          key: 'GFT-420',
          type: 'bug',
          title: 'Gift message cut after 100 characters',
          components: ['Gifts'],
          description: 'Long gift messages are truncated on the printed card.',
          links: [{ key: 'GFT-402', type: 'relates to' }],
          acceptanceCriteria: ['Regression test: a 250 character message is printed in full.'],
          bug: { stepsToReproduce: 'Add a 150 character gift message and place the order.', expected: 'The full message is printed.', actual: 'Only the first 100 characters are printed.', environment: 'Production, web checkout' },
          updatedAt: now,
        }),
        issue({ key: 'GFT-421', type: 'bug', title: 'Wrapping fee shown twice', components: ['Gifts'], description: 'The order summary lists the wrapping fee twice.', updatedAt: now }),
      );
    },
  },
  {
    id: 'api-idempotency',
    title: 'Confluence: Payments API becomes idempotent',
    description: 'The API reference is updated: POST /payments requires an Idempotency-Key header.',
    apply: (ctx) => {
      const d = ctx.documents.find((x) => x.id === '1002');
      if (d) {
        d.body = d.body.replace(
          'The endpoint accepts repeated requests; every request creates a new charge attempt.',
          'Requests must include an Idempotency-Key header; the endpoint is idempotent and repeated requests with the same key return the original charge attempt.',
        );
        d.updatedAt = new Date().toISOString();
      }
    },
  },
];
