import AppointmentDetail from '../models/AppointmentDetail.js';
import CustomOrder from '../models/CustomOrder.js';
import ProductDetail from '../models/ProductDetail.js';
import RentalDetail from '../models/RentalDetail.js';

const SENSITIVE_REQUEST_PATTERN = /\b(email|e-mail|phone|contact number|mobile number|address|password|passcode|otp|verification code|payment reference|reference number|receipt|card number|bank account|gcash|maya)\b/i;
const OTHER_CUSTOMER_PATTERN = /\b(other customer|another customer|someone else|other people's|everyone else's|all customers)\b/i;
const INVENTORY_PATTERN = /\b(inventory|stock|availability|how many gowns|how many dresses|available tomorrow|available today|is this item available|is this gown available|is this dress available|which items are currently available)\b/i;
const APPOINTMENT_PATTERN = /\b(appointment|appointments|consultation|consultations|fitting|fittings|measurement|measurements|reschedule|schedule)\b/i;
const RENTAL_PATTERN = /\b(rental|rentals|rent|gown|gowns|dress|dresses|pickup|pick up|return|returns|due date|due back)\b/i;
const CUSTOM_ORDER_PATTERN = /\b(custom order|custom orders|bespoke|design approval|design|order status|custom status)\b/i;
const BRANCH_PATTERN = /\b(preferred branch|my branch|branch)\b/i;
const OVERVIEW_PATTERN = /\b(summary|overview|status|statuses|upcoming|next|current|what do i have|do i have)\b/i;
const WHEN_PATTERN = /\b(when|date|time|what time|what day)\b/i;
const WHAT_PATTERN = /\b(what|what is it for|what's it for|type|purpose|for)\b/i;
const WHERE_PATTERN = /\b(where|which branch|what branch|location)\b/i;
const PAYMENT_PATTERN = /\b(paid|payment|pay|downpayment|down payment|balance)\b/i;
const PROCESS_TIMING_PATTERN = /\b(when will|how long|how soon|take a while|be confirmed|confirmed|be approved|approved|be processed|processed|be ready|ready|be available|available|finished|complete|completed)\b/i;
const BUSINESS_CONTACT_PATTERN = /\b(contact information|contact info|contact details|how can i contact|how do i contact|how to contact|reach you|reach your store|store contact|contact your store)\b/i;
const ACKNOWLEDGEMENT_PATTERN = /\b(thank you|thanks|thank u|ty|okay thanks|ok thanks|okay thank you|ok thank you|got it|noted|alright|all right|sure thanks)\b/i;
const CASUAL_CLOSE_PATTERN = /\b(bye|goodbye|see you|that is all|that's all|thats all|no worries)\b/i;
const FOLLOW_UP_CONTEXT_PATTERN = /\b(when|what|where|which|how long|how soon|will it|is it|does it|for it|about it|that one|this one|it)\b/i;
const SIMPLE_MATH_PATTERN = /^(?:what is|what's|calculate|compute|solve)?\s*(-?\d+(?:\.\d+)?)\s*([+\-xX*/])\s*(-?\d+(?:\.\d+)?)\s*\??$/i;
const WEBSITE_RELATED_PATTERN = /\b(hannah vanessa|website|site|store|shop|boutique|service|services|hours|business hours|email|instagram|facebook|support|parking|holiday|walk-?in|gown|gowns|dress|dresses|bridal|wedding|evening gown|rental|rentals|bespoke|custom order|custom orders|fabric|fabrics|appointment|appointments|consultation|fitting|measurement|measurements|book|booking|collection|collections|catalog|contact|branch|pickup|pick up|return|returns|payment|downpayment|balance|order|orders|profile|account|chat)\b/i;
const GENERIC_QUESTION_PATTERN = /\b(what|who|when|where|why|how|can you|could you|do you know|tell me|define|explain|calculate|compute|solve)\b/i;
const BEST_SELLER_PATTERN = /\b(most popular item|most popular gown|bestsellers|best sellers|best seller|popular gowns|popular items)\b/i;

const STATIC_FAQ_RULES = [
  { pattern: /\b(what is hannah vanessa|about hannah vanessa|what kind of shop)\b/i, reply: 'Hannah Vanessa Dress Shop is an item rental and bespoke shop that offers elegant items for weddings, debuts, proms, evening events, and other special occasions. We also provide custom tailoring, alterations, and appointment scheduling.' },
  { pattern: /\b(what services do you offer|services do you offer|what do you offer)\b/i, reply: 'We offer item rentals, bespoke or custom-made items, item alterations, fitting appointments, AI-powered measurement, and AI-powered item color recommendations.' },
  { pattern: /\b(where is your shop|shop located|store located|store address|location)\b/i, reply: 'Our store is located at Blk 185 Lot 09 Cadena de Amor St, corner Kampupot, Makati City, 1218.' },
  { pattern: /\b(business hours|what time .* open|opening hours|open from|close|closing time)\b/i, reply: 'We are open from 9:00 AM to 12:00 PM and 1:00 PM to 6:00 PM, Mondays to Saturdays.' },
  { pattern: /\b(phone number|contact number|mobile number)\b/i, reply: 'Please contact us through this number: 0917 593 1093.' },
  { pattern: /\b(what is your email|email address|shop email)\b/i, reply: 'Please contact us through this email address: hannahvanessaexclusive@gmail.com.' },
  { pattern: /\b(instagram|ig account)\b/i, reply: 'Here is our Instagram account: https://www.instagram.com/officialhvd/' },
  { pattern: /\b(facebook|fb account)\b/i, reply: 'Here is our Facebook account: https://www.facebook.com/HannahVanessaExclusive/' },
  { pattern: /\b(open during holidays|open on holidays|holiday schedule)\b/i, reply: 'Our holiday schedule may vary. Please check our announcements or contact us before visiting.' },
  { pattern: /\b(parking|parking available)\b/i, reply: 'We only have limited parking space, and it is on a first-come, first-served basis.' },
  { pattern: /\b(walk-?in|walk in customers)\b/i, reply: 'Yes, walk-ins are welcome, but appointments are recommended to ensure availability.' },
  { pattern: /\b(do i need to create an account|need an account)\b/i, reply: 'If you wish to avail any of our online services, account creation is required to continue.' },
  { pattern: /\b(browse .* without logging in|browse .* without .* log ?in|browse products .* without)\b/i, reply: 'Yes, but to avail any of our online services, you are required to log in.' },

  { pattern: /\b(how do i rent|how to rent|rent an item)\b/i, reply: 'To rent an item, you must first log in to your account, browse our collection, choose your item, then click "Book Now".' },
  { pattern: /\b(requirements for renting|rental requirements)\b/i, reply: 'The basic requirements are a valid account, a 50% deposit, and a valid government ID when picking the item up.' },
  { pattern: /\b(how much is the rental fee|rental fee|rental price|rental prices)\b/i, reply: 'Rental prices vary depending on the item\'s design, brand, and rental duration. The price is displayed on each item page.' },
  { pattern: /\b(security deposit)\b/i, reply: 'Yes. Some items require a refundable security deposit to cover possible damages or late returns.' },
  { pattern: /\b(how long is the rental period|rental period)\b/i, reply: 'The standard rental period is 3 to 7 days, which can be adjusted upon renting.' },
  { pattern: /\b(extend my rental|extend the rental period|rental extension)\b/i, reply: 'Yes, provided the item is not reserved by another customer. Additional rental charges may apply.' },
  { pattern: /\b(return .* late|late return)\b/i, reply: 'Late returns may incur a fee of PHP 200 per day based on our rental policy.' },
  { pattern: /\b(reserve .* in advance|reserve .* ahead)\b/i, reply: 'Yes. You may reserve available items ahead of your event date.' },
  { pattern: /\b(how do i know if .* available|is this item available|availability shown|which items are currently available)\b/i, reply: 'Availability is shown on each gown\'s page and is updated regularly. You can also use the Available filter on the collection page.' },
  { pattern: /\b(someone else return .* for me|authorization letter)\b/i, reply: 'Yes, with a proper authorization letter and a copy of their valid government ID. Please inform us ahead of time or we will not honor it.' },
  { pattern: /\b(damage the item|damaged the item)\b/i, reply: 'Please inform us immediately. Repair or replacement charges may apply depending on the extent of the damage.' },
  { pattern: /\b(cancel my rental reservation|cancel rental reservation)\b/i, reply: 'If a 50% deposit has been made, the rental reservation is not cancellable.' },
  { pattern: /\b(refund after cancellation|receive a refund .* cancellation)\b/i, reply: 'No. Once a 50% deposit is paid, it is non-refundable.' },
  { pattern: /\b(rent multiple items|multiple items at once)\b/i, reply: 'Yes, you can rent multiple items in a single order.' },
  { pattern: /\b(try on .* before renting|fit .* before renting)\b/i, reply: 'Yes, we suggest fitting the item so we can adjust it to your size.' },
  { pattern: /\b(accessories included|include accessories)\b/i, reply: 'Some items include accessories for an added fee, while other designs may not.' },
  { pattern: /\b(modify a rented item|alter a rented item|permanent alterations .* rentals)\b/i, reply: 'Only minor temporary adjustments are allowed. Permanent alterations are not permitted on rentals.' },
  { pattern: /\b(what if .* doesn\'?t fit|what if .* does not fit)\b/i, reply: 'Each rented item will be tailored to fit our customers.' },
  { pattern: /\b(exchange my rented item|exchange .* rented item)\b/i, reply: 'Unfortunately, once you have rented an item, you cannot exchange it for a different one.' },
  { pattern: /\b(professionally cleaned|cleaned after each rental)\b/i, reply: 'Each rental item is professionally cleaned after every rental to ensure cleanliness, condition, and quality.' },

  { pattern: /\b(custom-made items|custom made items|bespoke gowns|do you offer custom)\b/i, reply: 'Yes. We create bespoke gowns tailored to your measurements, style preferences, and event requirements.' },
  { pattern: /\b(how do i order a bespoke|order a bespoke item|order a custom item)\b/i, reply: 'To order a bespoke item, you must first log in to your account, go to our bespoke form, and fill out the design information.' },
  { pattern: /\b(how long does it take to make a custom item|production time|how long .* custom)\b/i, reply: 'Production time depends on the complexity of the design, but most custom gowns take several weeks to complete.' },
  { pattern: /\b(provide my own design|own design|reference photos|sketches)\b/i, reply: 'Absolutely. You may provide reference photos or sketches, and we will discuss whether the design can be created.' },
  { pattern: /\b(modifications to an existing design|changes to an existing design)\b/i, reply: 'Yes, discuss your desired changes during consultation. Some changes may affect cost or timeline.' },
  { pattern: /\b(what fabrics are available|fabric options)\b/i, reply: 'Fabric options depend on the design and current stock. We will present suitable choices during consultation.' },
  { pattern: /\b(choose my own color|custom colors|own color)\b/i, reply: 'Yes, custom colors can be requested subject to fabric availability and dyeing feasibility.' },
  { pattern: /\b(design consultations|design consultation)\b/i, reply: 'Yes, the first step of our bespoke process is a design consultation.' },
  { pattern: /\b(changes after production starts|make changes after production starts)\b/i, reply: 'Minor adjustments may be possible, but major design changes may result in additional costs or production delays.' },
  { pattern: /\b(how much does a custom item cost|custom item cost|bespoke price|bespoke cost)\b/i, reply: 'Pricing depends on design complexity, fabric, embellishments, and timeline. A quote is provided after consultation.' },
  { pattern: /\b(is a down payment required|down payment required|required down payment)\b/i, reply: 'Yes, rentals and bespoke orders require a 50% down payment.' },
  { pattern: /\b(is the down payment refundable|down payment refundable)\b/i, reply: 'No. Down payments for rentals and bespoke orders are non-refundable once paid, and bespoke down payments are non-refundable once production begins.' },
  { pattern: /\b(remaining balance due|when is the remaining balance due)\b/i, reply: 'The remaining 50% is due upon final fitting or before pickup or delivery.' },
  { pattern: /\b(rush my custom order|rush order)\b/i, reply: 'Rush orders may be accommodated depending on workload, and rush fees may apply.' },
  { pattern: /\b(fitting sessions .* bespoke|provide fitting sessions)\b/i, reply: 'Yes, fitting sessions are included to ensure proper fit before handover.' },

  { pattern: /\b(how do i book an appointment|book an appointment)\b/i, reply: 'Select your preferred date and time through our appointment system and wait for confirmation.' },
  { pattern: /\b(reschedule my appointment|reschedule an appointment)\b/i, reply: 'Yes. You may reschedule before your appointment date, subject to available time slots.' },
  { pattern: /\b(cancel my appointment|cancel an appointment)\b/i, reply: 'Yes. Appointments can be canceled through your account or by contacting our shop.' },
  { pattern: /\b(how early should i arrive|arrive early)\b/i, reply: 'The standard arrival time is 15 minutes before your scheduled appointment.' },
  { pattern: /\b(miss my appointment|no-?show)\b/i, reply: 'If you miss your appointment, it will be canceled by our team and you may set another appointment for a different day.' },
  { pattern: /\b(bring someone with me|bring a companion)\b/i, reply: 'Yes, you may bring a companion, subject to shop capacity.' },
  { pattern: /\b(what services require appointments|services require appointments)\b/i, reply: 'Services such as design consultation, fitting appointments, measurement sessions, and pickup or return services require appointments.' },
  { pattern: /\b(book multiple appointments|multiple appointments)\b/i, reply: 'Multiple sessions are allowed as long as they are not overlapping with your existing appointments.' },
  { pattern: /\b(how will i know my appointment is confirmed|appointment confirmed)\b/i, reply: 'You will receive a text message and email regarding your confirmation, or you may check your appointments for updates.' },
  { pattern: /\b(earliest appointment available|earliest slot)\b/i, reply: 'Please check the appointment calendar in your account. The earliest slots update in real time.' },
  { pattern: /\b(book an appointment now|book now)\b/i, reply: 'Yes, log in and select a slot. You will receive confirmation via SMS and email.' },

  { pattern: /\b(payment methods|what payment methods do you accept|accepted payments)\b/i, reply: 'Our payment methods include credit and debit cards, e-wallets, QRPh codes, cash, GCash, and bank transfers.' },
  { pattern: /\b(pay online|online payments)\b/i, reply: 'Yes. Online payments are supported for eligible transactions.' },
  { pattern: /\b(accept cash)\b/i, reply: 'Yes, cash payments are accepted.' },
  { pattern: /\b(accept gcash)\b/i, reply: 'Yes, GCash payments are accepted.' },
  { pattern: /\b(bank transfers)\b/i, reply: 'Yes, bank transfers are accepted.' },
  { pattern: /\b(will i receive a receipt|receive a receipt)\b/i, reply: 'Yes. A digital or printed receipt will be provided after successful payment.' },
  { pattern: /\b(how do i know if my payment was successful|payment was successful|payment confirmation)\b/i, reply: 'You will receive a payment confirmation notification and your order status will be updated.' },
  { pattern: /\b(request a refund|can i request a refund)\b/i, reply: 'Refunds follow our cancellation policy: 50% deposits are non-refundable once paid. Other refunds are evaluated case by case per policy.' },
  { pattern: /\b(which payment option is best|best payment option)\b/i, reply: 'For speed, e-wallet or QRPh is best. For records, card payments are a good choice. All are secure.' },

  { pattern: /\b(how do you take measurements|take measurements)\b/i, reply: 'Measurements can be taken during your fitting appointment or submitted if requested for custom orders.' },
  { pattern: /\b(submit my measurements online|measurements online)\b/i, reply: 'Yes, there is a section in My Profile where you can input your measurements.' },
  { pattern: /\b(what measurements are required|required measurements)\b/i, reply: 'The measurements recorded are height, bust, waist, hips, shoulder width, and shoulder length.' },
  { pattern: /\b(how often should i update my measurements|update my measurements)\b/i, reply: 'If you are a casual shopper, updating every 3 to 6 months is usual. If you are undergoing fitness or weight changes, updating every 2 to 4 weeks is recommended for accuracy.' },
  { pattern: /\b(someone else submit measurements|someone else .* measurements)\b/i, reply: 'If they have access to your Hannah Vanessa account, they may be able to, but we suggest submitting it yourself to make sure there are no errors.' },
  { pattern: /\b(lose or gain weight after ordering|gain weight after ordering|lose weight after ordering)\b/i, reply: 'There will be a fitting session before picking up the item, so we will be able to make fitting adjustments for you.' },
  { pattern: /\b(measurements kept private|measurements private)\b/i, reply: 'Measurements are kept confidential and are only shared with people involved in the process of your order.' },
  { pattern: /\b(what if i don\'?t know my measurements|do not know my measurements)\b/i, reply: 'No problem. We can take your measurements during your fitting appointment.' },

  { pattern: /\b(what sizes are available|sizes available)\b/i, reply: 'Sizes are not specified because each rental gown is adjusted to fit each customer properly.' },
  { pattern: /\b(how often do you add new items|new arrivals)\b/i, reply: 'New arrivals are added periodically. Please follow our socials or check the site for updates.' },
  { pattern: /\b(what item styles do you offer|styles do you offer|type of gowns|types of gowns|kind of gowns|kinds of gowns)\b/i, reply: 'We offer multiple styles such as evening gowns, long gowns, wedding dresses, ball gowns, and more.' },
  { pattern: /\b(wedding items|wedding gowns)\b/i, reply: 'Yes, we do have a selection of wedding gowns.' },
  { pattern: /\b(debut items|debut gowns)\b/i, reply: 'Yes, we do have a selection of gowns suited for debutantes.' },
  { pattern: /\b(prom items|prom gowns)\b/i, reply: 'Yes, we do have a selection of gowns suited for proms.' },
  { pattern: /\b(evening items|evening gowns)\b/i, reply: 'Yes, we do have a selection of evening gowns.' },
  { pattern: /\b(what colors are available|available colors)\b/i, reply: 'Kindly check our collection to view available colors.' },
  { pattern: /\b(which item fits my budget|fits my budget|budget range)\b/i, reply: 'Please share your budget range and we can help filter and recommend suitable options.' },
  { pattern: /\b(show me similar items|similar items)\b/i, reply: 'Yes, provide a link or photo and we can help you find similar styles in stock.' },
  { pattern: /\b(items in my size|in my size)\b/i, reply: 'Since gowns are tailored, we adjust them to your measurements. Please share your event date so scheduling can be arranged.' },
  { pattern: /\b(accessories match this item|what accessories match)\b/i, reply: 'We can suggest veils, shawls, or jewelry add-ons that complement your chosen gown.' },
  { pattern: /\b(rent this item today|rent .* today)\b/i, reply: 'If it shows available for your dates and you can complete the deposit and ID requirements, yes.' },
  { pattern: /\b(recommend an item for my event|recommend a gown for my event)\b/i, reply: 'Yes, please tell us your event type, date, venue, and budget, and we will help shortlist options.' },
  { pattern: /\b(recommend an item based on my skin tone|recommend colors for my skin tone)\b/i, reply: 'Yes, you can use the AI color recommendation in the mobile app, or tell us your skin tone and we will suggest colors.' },
  { pattern: /\b(colors for morena|colors for fair|colors for light skin)\b/i, reply: 'Yes, tell us your skin tone and we can suggest complementary palettes, such as jewel tones for morena and pastels for fair skin.' },

  { pattern: /\b(do you offer alterations|offer alterations)\b/i, reply: 'Yes. We provide alteration services for eligible gowns.' },
  { pattern: /\b(rented items be altered|can rented items be altered)\b/i, reply: 'Minor temporary adjustments may be allowed, but permanent alterations are not permitted.' },
  { pattern: /\b(how much do alterations cost|alteration costs)\b/i, reply: 'Alteration costs may vary depending on the complexity of the alteration.' },
  { pattern: /\b(how long do alterations take|alteration time)\b/i, reply: 'Alteration time may vary depending on the complexity of the alteration.' },
  { pattern: /\b(last-minute alterations|last minute alterations)\b/i, reply: 'Last-minute alterations may be possible depending on the complexity of the alteration.' },

  { pattern: /\b(do you offer delivery|offer delivery)\b/i, reply: 'Delivery may be available depending on your location.' },
  { pattern: /\b(pick up my order at the shop|pickup at the shop|pick up at the shop)\b/i, reply: 'Yes. Orders can be picked up during business hours after confirmation.' },
  { pattern: /\b(how much is delivery|delivery cost)\b/i, reply: 'Delivery costs may depend on the courier used, such as JnT or Lalamove.' },
  { pattern: /\b(order is delayed|order delayed)\b/i, reply: 'If your order is delayed, we will call and email you regarding the reason and process it accordingly.' },
  { pattern: /\b(when should i return my rented item|return my rented item)\b/i, reply: 'Please return it by the return date in your confirmation. Reminders are sent beforehand.' },

  { pattern: /\b(refund policy|what is your refund policy)\b/i, reply: 'Fifty percent deposits are non-refundable. Other refunds are assessed per policy and circumstance.' },
  { pattern: /\b(return a custom item|return custom item|return bespoke item)\b/i, reply: 'Custom or bespoke items are generally non-returnable unless they are defective or incorrectly produced.' },
  { pattern: /\b(exchange my order|can i exchange my order)\b/i, reply: 'Exchanges are limited. Please contact support to discuss your options.' },
  { pattern: /\b(received the wrong item|wrong item)\b/i, reply: 'Please notify us immediately and we will arrange correction according to policy.' },
  { pattern: /\b(item has defects|defective item|item defects)\b/i, reply: 'Please report it immediately. We will assess and resolve it through repair, replacement, or credit as applicable.' },
  { pattern: /\b(how long do refunds take|refund processing time)\b/i, reply: 'Processing times vary. You will be notified once a refund is approved and processed.' },

  { pattern: /\b(ai color recommendation.*mobile app|recommend a item color|recommend a gown color)\b/i, reply: 'AI color recommendation is available on our mobile app.' },
  { pattern: /\b(how does the ai color recommendation work|color recommendation work)\b/i, reply: 'Take a clear photo of yourself and our AI will analyze your skin tone to recommend colors that complement you.' },
  { pattern: /\b(do i need to upload a photo|upload a photo)\b/i, reply: 'You will need to take a picture instead of uploading one for best results.' },
  { pattern: /\b(photo stored|uploaded photo stored)\b/i, reply: 'Your privacy is important. Photos are only used for color analysis according to our privacy policy.' },
  { pattern: /\b(how accurate are the recommendations|accurate .* recommendations)\b/i, reply: 'The AI provides guidance based on skin-tone analysis. Final choice still depends on personal preference and lighting.' },
  { pattern: /\b(multiple color suggestions|multiple colors)\b/i, reply: 'Yes, our AI color recommendation suggests multiple colors that match your skin tone.' },
  { pattern: /\b(work for all skin tones|all skin tones)\b/i, reply: 'Yes, our AI color recommendation works for all skin tones.' },

  { pattern: /\b(how do i register|register an account)\b/i, reply: 'To register an account, click the profile icon and fill out the registration form.' },
  { pattern: /\b(forgot my password|reset my password|forgot password)\b/i, reply: 'To reset your password, click the profile icon and then the "Forgot Password" option.' },
  { pattern: /\b(update my profile|edit my profile)\b/i, reply: 'To update your profile, first log in to your account, then click the profile icon to access your information.' },
  { pattern: /\b(change my email address|change email address)\b/i, reply: 'To change your email, click the Profile icon, click Edit Profile, update the email address, then enter the code sent to your email.' },

  { pattern: /\b(appointment reminders|receive appointment reminders)\b/i, reply: 'Yes, we will send you an email and text reminder regarding your upcoming appointment.' },
  { pattern: /\b(rental due reminders|receive rental due reminders)\b/i, reply: 'Yes, we will send you an email and text reminder regarding your rental return date.' },

  { pattern: /\b(cancellation policy|what is your cancellation policy)\b/i, reply: 'Rentals with a 50% deposit are non-cancellable and non-refundable. Bespoke down payments are non-refundable once production starts. Appointments can be canceled or rescheduled, while no-shows are canceled.' },
  { pattern: /\b(late return policy|what is your late return policy)\b/i, reply: 'The late return fee is PHP 200 per day.' },
  { pattern: /\b(privacy policy|what is your privacy policy)\b/i, reply: 'Personal data and measurements are kept confidential and used only for order processing and service improvement.' },
  { pattern: /\b(terms and conditions)\b/i, reply: 'Our terms and conditions cover rentals, bespoke orders, payments, deposits, damages, late fees, and pickup or return procedures.' },
  { pattern: /\b(lose a rented item|lost a rented item)\b/i, reply: 'If you lose a rented item, you will need to pay the retail price of the gown.' },

  { pattern: /\b(contact customer support|customer support)\b/i, reply: 'You may contact customer support by phone at 0917 593 1093, by email at hannahvanessaexclusive@gmail.com, or by visiting the shop.' },
  { pattern: /\b(how long does customer support take to respond|support take to respond)\b/i, reply: 'We aim to respond within 1 to 2 business days. For urgent matters, calling by phone is faster.' },
  { pattern: /\b(report a problem through the chatbot|report a problem)\b/i, reply: 'Yes, you can use the chatbot to log issues and our team will follow up.' },
  { pattern: /\b(website isn\'?t working|website is not working|site isn\'?t working)\b/i, reply: 'Please try refreshing, clearing your cache, or switching browsers. If it persists, contact support.' },
  { pattern: /\b(report a payment issue|payment issue)\b/i, reply: 'Please contact support with your order details, payment method, and payment timestamp.' },
  { pattern: /\b(report a bug|bug report)\b/i, reply: 'You can use the chatbot or email support with steps to reproduce the issue and screenshots.' },
  { pattern: /\b(speak with a staff member|talk to a staff member|talk to staff)\b/i, reply: 'Yes, please call 0917 593 1093 or message us and we will connect you.' },

  { pattern: /\b(how much will this cost in total|total cost)\b/i, reply: 'The total cost is the rental or bespoke price plus any accessories, alterations if any, delivery if applicable, and the deposit.' },
  { pattern: /\b(help me choose between renting and custom tailoring|renting and custom tailoring)\b/i, reply: 'Renting is faster and more cost-effective, while bespoke is ideal for unique designs and a perfect fit over time.' },
  { pattern: /\b(what happens after i submit my order|after i submit my order)\b/i, reply: 'You will receive confirmation, payment instructions, and appointment scheduling if needed.' },
  { pattern: /\b(where is my order now)\b/i, reply: 'Please check your order status in your account or contact support with your order number.' },
];

function formatDateOnly(value) {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date?.getTime?.())) return String(value);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatAppointmentLabel(appointment) {
  const type = normalizeText(appointment?.type || 'appointment');
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function formatStatusLabel(status) {
  const text = normalizeText(status).replace(/-/g, ' ');
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Unknown';
}

function formatCustomerLabel(customerId) {
  if (!customerId) return 'Guest customer';
  const idString = String(customerId);
  const shortId = idString.slice(-4);
  return `Customer #${shortId}`;
}

function normalizeText(value) {
  return String(value || '').trim();
}

function isUnrelatedToWebsite(userQuery, queryProfile) {
  const trimmedQuery = normalizeText(userQuery);
  if (!trimmedQuery) return false;

  if (
    queryProfile.isAcknowledgement ||
    queryProfile.isCasualClose ||
    queryProfile.hasExplicitTopic ||
    queryProfile.asksAppointments ||
    queryProfile.asksRentals ||
    queryProfile.asksCustomOrders ||
    queryProfile.asksBranch ||
    queryProfile.asksBusinessContact ||
    queryProfile.asksSensitiveInfo ||
    queryProfile.asksOtherCustomerData ||
    queryProfile.asksInventory
  ) {
    return false;
  }

  if (WEBSITE_RELATED_PATTERN.test(trimmedQuery)) {
    return false;
  }

  return SIMPLE_MATH_PATTERN.test(trimmedQuery) || GENERIC_QUESTION_PATTERN.test(trimmedQuery);
}

function buildPublicStoreReply(userQuery) {
  const trimmedQuery = normalizeText(userQuery);
  if (!trimmedQuery) return '';

  const matchedRule = STATIC_FAQ_RULES.find((rule) => rule.pattern.test(trimmedQuery));
  if (matchedRule) {
    return matchedRule.reply;
  }

  if (/\b(offer|offers|carry|available styles|available gowns|kind of gowns|kinds of gowns|types of gowns|types of dresses|collections|catalog|services|rentals available|bespoke service)\b/i.test(trimmedQuery)) {
    return 'Hannah Vanessa can help with gown collections, rentals, bespoke orders, appointments, and contact details. You can ask about available services, booking, rentals, or bespoke options.';
  }

  return '';
}

async function buildFeaturedBestSellerReply(userQuery) {
  const trimmedQuery = normalizeText(userQuery);
  if (!BEST_SELLER_PATTERN.test(trimmedQuery)) {
    return '';
  }

  try {
    const selectedFeatured = await ProductDetail.find({
      status: { $ne: 'archived' },
      featuredHome: true,
    })
      .select('name')
      .sort({ createdAt: -1 })
      .limit(6)
      .lean();

    const featuredNames = selectedFeatured
      .map((item) => normalizeText(item?.name))
      .filter(Boolean);

    if (featuredNames.length === 0) {
      return 'Our current best sellers are based on the featured gowns shown on the homepage. Please check the Featured Gowns section for the latest picks.';
    }

    if (featuredNames.length === 1) {
      return `Our current featured best seller is ${featuredNames[0]}.`;
    }

    const intro = featuredNames.length > 3
      ? 'Our current best sellers are based on the featured gowns on the homepage, including '
      : 'Our current best sellers are ';
    const listText = featuredNames.length === 2
      ? `${featuredNames[0]} and ${featuredNames[1]}`
      : `${featuredNames.slice(0, -1).join(', ')}, and ${featuredNames[featuredNames.length - 1]}`;

    return `${intro}${listText}.`;
  } catch {
    return 'Our current best sellers are based on the featured gowns shown on the homepage. Please check the Featured Gowns section for the latest picks.';
  }
}

function analyzeUserQuery(userQuery) {
  const query = normalizeText(userQuery).toLowerCase();
  const isAcknowledgement = ACKNOWLEDGEMENT_PATTERN.test(query);
  const isCasualClose = CASUAL_CLOSE_PATTERN.test(query);
  const explicitAppointments = APPOINTMENT_PATTERN.test(query);
  const explicitRentals = RENTAL_PATTERN.test(query);
  const explicitCustomOrders = CUSTOM_ORDER_PATTERN.test(query);
  const explicitBranch = BRANCH_PATTERN.test(query);
  const asksOverview = OVERVIEW_PATTERN.test(query);
  const asksSensitiveInfo = SENSITIVE_REQUEST_PATTERN.test(query);
  const asksOtherCustomerData = OTHER_CUSTOMER_PATTERN.test(query);
  const asksInventory = INVENTORY_PATTERN.test(query);
  const asksBusinessContact = BUSINESS_CONTACT_PATTERN.test(query);
  const asksPublicStoreInfo = /\b(your|store|shop|hannah vanessa|business)\b/.test(query);
  const hasExplicitTopic = explicitAppointments || explicitRentals || explicitCustomOrders || explicitBranch;
  const shouldExpandOverview = asksOverview && !hasExplicitTopic;

  return {
    query,
    isAcknowledgement,
    isCasualClose,
    explicitAppointments,
    explicitRentals,
    explicitCustomOrders,
    explicitBranch,
    asksAppointments: explicitAppointments || shouldExpandOverview,
    asksRentals: explicitRentals || shouldExpandOverview,
    asksCustomOrders: explicitCustomOrders || shouldExpandOverview,
    asksBranch: explicitBranch || shouldExpandOverview,
    asksSensitiveInfo,
    asksOtherCustomerData,
    asksInventory,
    asksBusinessContact,
    asksPublicStoreInfo,
    hasExplicitTopic,
    asksAccountSpecificQuestion: /\b(my|me|mine)\b/.test(query) || asksOverview,
  };
}

function getGuardrailReply(queryProfile, customerId, options = {}) {
  const { hasPublicStoreReply = false } = options;
  if (queryProfile.isAcknowledgement) {
    return 'You\'re welcome. Let me know if there\'s anything else I can help you with.';
  }

  if (queryProfile.isCasualClose) {
    return 'You\'re welcome. If you need anything else, I\'m here to help.';
  }

  if (queryProfile.asksBusinessContact) {
    return 'Please contact us through here';
  }

  if (queryProfile.asksOtherCustomerData) {
    return 'I can only help with the signed-in customer\'s own account. I can\'t share another customer\'s details.';
  }

  if (queryProfile.asksSensitiveInfo && !queryProfile.asksPublicStoreInfo) {
    return 'I can help with your statuses, schedules, and branch-related updates, but I can\'t reveal private details like email addresses, phone numbers, addresses, passwords, receipts, or payment reference numbers in chat.';
  }

  if (queryProfile.asksInventory && !hasPublicStoreReply) {
    return 'Availability is shown on each gown\'s page and is updated regularly. I can\'t check live inventory for a specific item in this chat yet.';
  }

  if (!customerId && queryProfile.asksAccountSpecificQuestion && !hasPublicStoreReply) {
    return 'I can answer general questions here, but I can\'t look up account-specific appointments, rentals, or bespoke orders unless you are signed in.';
  }

  return '';
}

async function loadRelevantCustomerData({ customerId, queryProfile }) {
  if (!customerId) {
    return { appointments: [], rentals: [], customOrders: [] };
  }

  const tasks = [];

  tasks.push(
    queryProfile.asksAppointments
      ? AppointmentDetail.find({ customerId })
          .select('type date time branch status selectedGown selectedGownName')
          .sort({ date: 1, createdAt: -1 })
          .limit(8)
          .lean()
      : Promise.resolve([])
  );

  tasks.push(
    queryProfile.asksRentals
      ? RentalDetail.find({ customerId })
          .select('gownName startDate endDate branch eventType status pickupScheduleDate pickupScheduleTime')
          .sort({ createdAt: -1 })
          .limit(8)
          .lean()
      : Promise.resolve([])
  );

  tasks.push(
    queryProfile.asksCustomOrders
      ? CustomOrder.find({ customerId })
          .select('orderType eventDate branch consultationDate consultationTime fittingDate fittingTime status isArchived')
          .sort({ createdAt: -1 })
          .limit(8)
          .lean()
      : Promise.resolve([])
  );

  const [appointments, rentals, customOrders] = await Promise.all(tasks);
  return { appointments, rentals, customOrders };
}

function buildSupportedTopicFacts(queryProfile) {
  const topics = [];
  if (queryProfile.asksAppointments) topics.push('the customer\'s own appointments');
  if (queryProfile.asksRentals) topics.push('the customer\'s own rentals');
  if (queryProfile.asksCustomOrders) topics.push('the customer\'s own bespoke orders');
  if (queryProfile.asksBranch) topics.push('the customer\'s preferred branch');
  if (topics.length === 0) {
    topics.push('general account-safe support using only non-sensitive facts');
  }
  return topics;
}

function buildSanitizedFacts({ customerLabel, preferredBranch, appointments, rentals, customOrders, queryProfile }) {
  const facts = [`Customer label: ${customerLabel}`];
  facts.push('Sensitive fields such as email addresses, phone numbers, street addresses, payment references, payment receipts, and passwords are never available to share.');
  facts.push(`Allowed answer topics: ${buildSupportedTopicFacts(queryProfile).join(', ')}.`);

  if (preferredBranch) {
    facts.push(`Preferred branch: ${preferredBranch}`);
  }

  if (appointments?.length > 0) {
    const upcoming = appointments
      .filter((appointment) => !['completed', 'cancelled'].includes(String(appointment.status || '').toLowerCase()))
      .sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime())
      .slice(0, 3);
    facts.push(`Appointments count: ${appointments.length}.`);
    if (upcoming.length > 0) {
      facts.push(
        `Upcoming appointments: ${upcoming
          .map((appointment) => {
            const date = formatDateOnly(appointment.date);
            const gownName = normalizeText(appointment.selectedGownName || appointment.selectedGown);
            return `${appointment.type || 'appointment'} on ${date}${appointment.time ? ` at ${appointment.time}` : ''}${appointment.branch ? `, ${appointment.branch}` : ''}${gownName ? ` for ${gownName}` : ''} (${appointment.status || 'pending'})`;
          })
          .join('; ')}.`
      );
    } else {
      facts.push('There are no upcoming appointments on file.');
    }
  }

  if (rentals?.length > 0) {
    const activeRentals = rentals.filter((rental) => !['completed', 'cancelled', 'item_lost'].includes(String(rental.status || '').toLowerCase()));
    facts.push(`Rental records count: ${rentals.length}, active rentals: ${activeRentals.length}.`);
    if (activeRentals.length > 0) {
      facts.push(
        `Active rentals: ${activeRentals
          .slice(0, 3)
          .map((rental) => {
            const endDate = formatDateOnly(rental.endDate);
            const pickupSchedule = rental.pickupScheduleDate
              ? `, pickup ${formatDateOnly(rental.pickupScheduleDate)}${rental.pickupScheduleTime ? ` at ${rental.pickupScheduleTime}` : ''}`
              : '';
            return `${rental.gownName || 'rental item'} due ${endDate}${rental.branch ? `, ${rental.branch}` : ''}${pickupSchedule}${rental.eventType ? ` for ${rental.eventType}` : ''} (${rental.status})`;
          })
          .join('; ')}.`
      );
    } else {
      facts.push('There are no active rentals on file.');
    }
  }

  if (customOrders?.length > 0) {
    const openOrders = customOrders.filter((order) => !['completed', 'rejected'].includes(String(order.status || '').toLowerCase()));
    facts.push(`Custom order records count: ${customOrders.length}, open orders: ${openOrders.length}.`);
    if (openOrders.length > 0) {
      facts.push(
        `Open custom orders: ${openOrders
          .slice(0, 3)
          .map((order) => {
            const eventDate = formatDateOnly(order.eventDate);
            const state = order.status ? `${order.status}` : 'inquiry';
            const schedule = order.fittingDate || order.consultationDate ? `, schedule ${formatDateOnly(order.fittingDate || order.consultationDate)}` : '';
            return `${order.orderType || 'order'}${eventDate ? ` for ${eventDate}` : ''}${order.branch ? `, ${order.branch}` : ''}${schedule}${state ? ` (${state})` : ''}`;
          })
          .join('; ')}.`
      );
    } else {
      facts.push('There are no open bespoke orders on file.');
    }
  }

  if (facts.length === 3) {
    facts.push('No customer-specific database facts are available.');
  }

  return facts;
}

function getUpcomingAppointments(appointments) {
  return (appointments || [])
    .filter((appointment) => !['completed', 'cancelled'].includes(String(appointment.status || '').toLowerCase()))
    .sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());
}

function buildDirectAppointmentReply(userQuery, appointments) {
  const upcomingAppointments = getUpcomingAppointments(appointments);
  if (upcomingAppointments.length === 0) {
    return 'You do not have any upcoming appointments right now.';
  }

  const nextAppointment = upcomingAppointments[0];
  const appointmentLabel = formatAppointmentLabel(nextAppointment);
  const appointmentDate = formatDateOnly(nextAppointment.date);
  const appointmentTime = normalizeText(nextAppointment.time);
  const appointmentBranch = normalizeText(nextAppointment.branch);
  const gownName = normalizeText(nextAppointment.selectedGownName || nextAppointment.selectedGown);
  const normalizedQuery = normalizeText(userQuery).toLowerCase();

  if (PROCESS_TIMING_PATTERN.test(normalizedQuery) && !WHAT_PATTERN.test(normalizedQuery) && !WHERE_PATTERN.test(normalizedQuery)) {
    return 'It may take a while. If you want a definite answer, please contact our store directly.';
  }

  if (WHEN_PATTERN.test(normalizedQuery)) {
    return `Your next appointment is a ${appointmentLabel.toLowerCase()} on ${appointmentDate}${appointmentTime ? ` at ${appointmentTime}` : ''}${appointmentBranch ? ` at ${appointmentBranch}` : ''}.`;
  }

  if (WHERE_PATTERN.test(normalizedQuery)) {
    return appointmentBranch
      ? `Your next appointment is at ${appointmentBranch}.`
      : `Your next appointment is a ${appointmentLabel.toLowerCase()} on ${appointmentDate}${appointmentTime ? ` at ${appointmentTime}` : ''}.`;
  }

  if (WHAT_PATTERN.test(normalizedQuery)) {
    if (gownName) {
      return `Your next appointment is a ${appointmentLabel.toLowerCase()} for ${gownName}${appointmentDate ? ` on ${appointmentDate}` : ''}${appointmentTime ? ` at ${appointmentTime}` : ''}.`;
    }
    return `Your next appointment is a ${appointmentLabel.toLowerCase()}${appointmentDate ? ` on ${appointmentDate}` : ''}${appointmentTime ? ` at ${appointmentTime}` : ''}${appointmentBranch ? ` at ${appointmentBranch}` : ''}.`;
  }

  return `Your next appointment is a ${appointmentLabel.toLowerCase()} on ${appointmentDate}${appointmentTime ? ` at ${appointmentTime}` : ''}${appointmentBranch ? ` at ${appointmentBranch}` : ''}${gownName ? ` for ${gownName}` : ''}.`;
}

function getRelevantRentals(rentals) {
  const list = rentals || [];
  const openRentals = list.filter((rental) => !['completed', 'cancelled', 'item_lost'].includes(String(rental.status || '').toLowerCase()));
  return openRentals.length > 0 ? openRentals : list;
}

function buildDirectRentalReply(userQuery, rentals) {
  const relevantRentals = getRelevantRentals(rentals);
  if (relevantRentals.length === 0) {
    return 'You do not have any rental orders on file right now.';
  }

  const primaryRental = relevantRentals[0];
  const gownName = normalizeText(primaryRental.gownName || 'rental gown');
  const status = normalizeText(primaryRental.status);
  const statusLabel = formatStatusLabel(status);
  const endDate = formatDateOnly(primaryRental.endDate);
  const startDate = formatDateOnly(primaryRental.startDate);
  const branch = normalizeText(primaryRental.branch);
  const eventType = normalizeText(primaryRental.eventType);
  const pickupDate = primaryRental.pickupScheduleDate ? formatDateOnly(primaryRental.pickupScheduleDate) : '';
  const pickupTime = normalizeText(primaryRental.pickupScheduleTime);
  const normalizedQuery = normalizeText(userQuery).toLowerCase();
  const rentalCount = relevantRentals.length;
  const countText = rentalCount > 1 ? `You currently have ${rentalCount} rental orders. ` : 'You currently have 1 rental order. ';

  if (PROCESS_TIMING_PATTERN.test(normalizedQuery) && !WHAT_PATTERN.test(normalizedQuery) && !WHERE_PATTERN.test(normalizedQuery)) {
    return 'It may take a while. If you want a definite answer, please contact our store directly.';
  }

  if (PAYMENT_PATTERN.test(normalizedQuery)) {
    if (['paid_for_confirmation', 'for_pickup', 'active', 'completed'].includes(status)) {
      return `Yes, payment for ${gownName} has already been recorded. Its current rental status is ${statusLabel.toLowerCase()}.`;
    }
    if (status === 'for_payment' || status === 'pending') {
      return `Payment for ${gownName} has not been fully confirmed yet. Its current rental status is ${statusLabel.toLowerCase()}.`;
    }
    return `${gownName} is currently in ${statusLabel.toLowerCase()} status.`;
  }

  if (WHEN_PATTERN.test(normalizedQuery)) {
    if (pickupDate) {
      return `Your rental for ${gownName} is currently in ${statusLabel.toLowerCase()} status, with pickup on ${pickupDate}${pickupTime ? ` at ${pickupTime}` : ''}${branch ? ` at ${branch}` : ''}.`;
    }
    if (endDate) {
      return `Your rental for ${gownName} is currently in ${statusLabel.toLowerCase()} status and is due on ${endDate}${branch ? ` at ${branch}` : ''}.`;
    }
    if (startDate) {
      return `Your rental for ${gownName} is currently in ${statusLabel.toLowerCase()} status and starts on ${startDate}${branch ? ` at ${branch}` : ''}.`;
    }
  }

  if (WHERE_PATTERN.test(normalizedQuery)) {
    return branch
      ? `Your rental for ${gownName} is being handled at ${branch}.`
      : `Your rental for ${gownName} is currently in ${statusLabel.toLowerCase()} status, but I do not see a branch listed yet.`;
  }

  if (WHAT_PATTERN.test(normalizedQuery)) {
    return `${countText}Your next rental is for ${gownName}, currently in ${statusLabel.toLowerCase()} status${eventType ? ` for ${eventType}` : ''}${pickupDate ? `, with pickup on ${pickupDate}${pickupTime ? ` at ${pickupTime}` : ''}` : ''}${endDate ? `, due on ${endDate}` : ''}${branch ? ` at ${branch}` : ''}.`;
  }

  return `${countText}Your next rental is for ${gownName}, currently in ${statusLabel.toLowerCase()} status${eventType ? ` for ${eventType}` : ''}${pickupDate ? `, with pickup on ${pickupDate}${pickupTime ? ` at ${pickupTime}` : ''}` : ''}${endDate ? `, due on ${endDate}` : ''}${branch ? ` at ${branch}` : ''}.`;
}

function getRelevantCustomOrders(customOrders) {
  const orders = customOrders || [];
  const openOrders = orders.filter((order) => !['completed', 'rejected'].includes(String(order.status || '').toLowerCase()));
  return openOrders.length > 0 ? openOrders : orders;
}

function buildCustomOrderScheduleLabel(order) {
  const fittingDate = normalizeText(order?.fittingDate);
  const fittingTime = normalizeText(order?.fittingTime);
  if (fittingDate) {
    return `fitting on ${formatDateOnly(fittingDate)}${fittingTime ? ` at ${fittingTime}` : ''}`;
  }

  const consultationDate = normalizeText(order?.consultationDate);
  const consultationTime = normalizeText(order?.consultationTime);
  if (consultationDate) {
    return `consultation on ${formatDateOnly(consultationDate)}${consultationTime ? ` at ${consultationTime}` : ''}`;
  }

  const eventDate = normalizeText(order?.eventDate);
  if (eventDate) {
    return `event date ${formatDateOnly(eventDate)}`;
  }

  return '';
}

function buildDirectCustomOrderReply(userQuery, customOrders) {
  const relevantOrders = getRelevantCustomOrders(customOrders);
  if (relevantOrders.length === 0) {
    return 'You do not have any bespoke orders on file right now.';
  }

  const primaryOrder = relevantOrders[0];
  const orderType = normalizeText(primaryOrder.orderType || 'bespoke order');
  const statusLabel = formatStatusLabel(primaryOrder.status || 'inquiry');
  const branch = normalizeText(primaryOrder.branch);
  const scheduleLabel = buildCustomOrderScheduleLabel(primaryOrder);
  const normalizedQuery = normalizeText(userQuery).toLowerCase();
  const orderCount = relevantOrders.length;
  const countText = orderCount > 1 ? `You currently have ${orderCount} bespoke orders. ` : 'You currently have 1 bespoke order. ';

  if (PROCESS_TIMING_PATTERN.test(normalizedQuery) && !WHAT_PATTERN.test(normalizedQuery) && !WHERE_PATTERN.test(normalizedQuery)) {
    return 'It may take a while. If you want a definite answer, please contact our store directly.';
  }

  if (WHEN_PATTERN.test(normalizedQuery)) {
    if (scheduleLabel) {
      return `Your ${orderType} is currently in ${statusLabel.toLowerCase()} status, with ${scheduleLabel}.`;
    }
    return `Your ${orderType} is currently in ${statusLabel.toLowerCase()} status, and there is no schedule set yet.`;
  }

  if (WHERE_PATTERN.test(normalizedQuery)) {
    return branch
      ? `Your ${orderType} is being handled at ${branch}.`
      : `Your ${orderType} is currently in ${statusLabel.toLowerCase()} status, but I do not see a branch listed yet.`;
  }

  if (WHAT_PATTERN.test(normalizedQuery)) {
    return `${countText}Your next active order is ${orderType}, currently in ${statusLabel.toLowerCase()} status${scheduleLabel ? `, with ${scheduleLabel}` : ''}${branch ? ` at ${branch}` : ''}.`;
  }

  return `${countText}Your next active order is ${orderType}, currently in ${statusLabel.toLowerCase()} status${scheduleLabel ? `, with ${scheduleLabel}` : ''}${branch ? ` at ${branch}` : ''}.`;
}

function buildChatbotPrompt({ customerLabel, facts, userQuery }) {
  const lines = [
    'You are a customer support assistant for Hannah Vanessa, a bridal and rental service.',
    'Answer the customer using only the provided facts.',
    'Do not invent any private customer details like email addresses, phone numbers, addresses, or payment references.',
    'Do not reveal sensitive customer data. If you are not sure, ask a clarifying question.',
    'It is allowed to share the signed-in customer\'s own appointment date, time, branch, appointment type, rental due date, rental pickup schedule, and bespoke order status, branch, consultation date, fitting date, and event date when those facts are provided.',
    'You may answer only about the signed-in customer and only for the allowed topics listed in the facts.',
    'If the customer asks for restricted data or data that is not present in the facts, politely say that you cannot access or share it in chat.',
    'Use plain, friendly customer service language. Keep the answer concise.',
    'Always respond in complete sentences and never end mid-sentence or with a dangling phrase.',
    '',
    `Customer label: ${customerLabel}`,
    '',
    'Facts:',
    ...facts.map((fact) => `- ${fact}`),
    '',
  ];

  lines.push('Customer request:');
  lines.push(userQuery.trim());
  lines.push('');
  lines.push('Respond with a helpful, accurate answer based on the facts above.');
  return lines.join('\n');
}

function normalizeGeminiReply(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (/[.!?]["']?$/.test(normalized)) {
    return normalized;
  }

  const lastSentenceEnd = Math.max(
    normalized.lastIndexOf('.'),
    normalized.lastIndexOf('!'),
    normalized.lastIndexOf('?')
  );

  if (lastSentenceEnd >= 0) {
    const completedPortion = normalized.slice(0, lastSentenceEnd + 1).trim();
    if (completedPortion.length >= Math.max(24, Math.floor(normalized.length * 0.45))) {
      return completedPortion;
    }
  }

  return `${normalized}.`;
}

async function callGemini(prompt) {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }

  const model = String(process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.25,
        maxOutputTokens: 512,
        responseMimeType: 'text/plain',
      },
    }),
  });

  const responseBody = await response.json().catch(() => null);
  if (!response.ok) {
    const message = responseBody?.error?.message || 'Gemini request failed.';
    throw new Error(message);
  }

  const text = responseBody?.candidates?.[0]?.content?.parts?.map((part) => String(part?.text || '')).join('') || '';
  const normalized = normalizeGeminiReply(text);
  if (!normalized) {
    throw new Error('Gemini returned an empty reply.');
  }

  return normalized;
}

export async function generateGeminiChatReply({ customerId, preferredBranch, conversationHistory, userQuery }) {
  const queryProfile = analyzeUserQuery(userQuery);
  const featuredBestSellerReply = await buildFeaturedBestSellerReply(userQuery);
  const publicStoreReply = buildPublicStoreReply(userQuery);
  const guardrailReply = getGuardrailReply(queryProfile, customerId, {
    hasPublicStoreReply: Boolean(publicStoreReply || featuredBestSellerReply),
  });
  if (guardrailReply) {
    return guardrailReply;
  }

  if (featuredBestSellerReply) {
    return featuredBestSellerReply;
  }

  if (publicStoreReply) {
    return publicStoreReply;
  }

  if (isUnrelatedToWebsite(userQuery, queryProfile)) {
    return 'I can help only with questions related to the Hannah Vanessa website, such as gowns, rentals, bespoke orders, appointments, and contact details.';
  }

  const customerLabel = formatCustomerLabel(customerId);
  const { appointments, rentals, customOrders } = await loadRelevantCustomerData({
    customerId,
    queryProfile,
  });

  const facts = buildSanitizedFacts({
    customerLabel,
    preferredBranch,
    appointments,
    rentals,
    customOrders,
    queryProfile,
  });

  if (queryProfile.explicitCustomOrders) {
    const directCustomOrderReply = buildDirectCustomOrderReply(userQuery, customOrders);
    if (directCustomOrderReply) {
      return directCustomOrderReply;
    }
  }

  if (queryProfile.explicitAppointments) {
    const directAppointmentReply = buildDirectAppointmentReply(userQuery, appointments);
    if (directAppointmentReply) {
      return directAppointmentReply;
    }
  }

  if (queryProfile.explicitRentals) {
    const directRentalReply = buildDirectRentalReply(userQuery, rentals);
    if (directRentalReply) {
      return directRentalReply;
    }
  }

  if (queryProfile.asksCustomOrders) {
    const directCustomOrderReply = buildDirectCustomOrderReply(userQuery, customOrders);
    if (directCustomOrderReply) {
      return directCustomOrderReply;
    }
  }

  const prompt = buildChatbotPrompt({
    customerLabel,
    facts,
    userQuery,
  });

  try {
    return await callGemini(prompt);
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error || '').toLowerCase();
    if (
      message.includes('quota') ||
      message.includes('rate limit') ||
      message.includes('billing') ||
      message.includes('not configured')
    ) {
      return 'I can still help with Hannah Vanessa appointments, rentals, bespoke orders, and contact details, but I cannot answer general questions right now. Please try again shortly.';
    }
    throw error;
  }
}

export function buildCustomerLabel(customerId) {
  return formatCustomerLabel(customerId);
}
