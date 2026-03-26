/**
 * Generates a complete, self-contained HTML string for a Hey Jude's Lawn Care
 * service agreement. The output matches the branded template exactly and is
 * ready to open in a new tab for Save-as-PDF via the browser print dialog.
 *
 * @param {Object}        opts
 * @param {Object}        opts.client   - { name, phone, email, address, cityStateZip }
 * @param {Array<Object>} opts.services - enabled services, each { name, frequency, season, bullets: string[], price, priceLabel, anchorPrice, visitsPerYear, calcType }
 * @param {Object|null}   opts.plan     - { name, monthlyPrice, description, extras: string[] } or null
 * @param {Object}        opts.term     - { startDate, endDate, months }
 * @param {number}        opts.annualSavings - total annual savings vs individual pricing
 * @returns {string} Complete HTML document string
 */
export function generateAgreementHTML({ client, services, plan, plans, term, annualSavings = 0 }) {
  // ── Helper: format price ─────────────────────────────────────────
  const fmtPrice = (n) => {
    if (n == null) return '0.00';
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // ── Service cards ──────────────────────────────────────────────────
  const serviceCards = services
    .map(
      (svc) => {
        const isIncluded = svc.calcType === 'included' || svc.priceLabel === 'Included';
        const hasAnchor = !isIncluded && svc.anchorPrice != null && svc.anchorPrice > svc.price;

        // Build the pricing display
        let pricingHTML = '';
        if (isIncluded) {
          pricingHTML = `<div style="text-align:right;margin-top:10px;font-size:12px;font-weight:800;color:#B0FF03;">Included</div>`;
        } else if (hasAnchor) {
          pricingHTML = `
    <div style="text-align:right;margin-top:10px;">
      <div style="font-size:10px;color:rgba(255,255,255,.4);text-decoration:line-through;font-weight:600;">Individual rate: $${escapeHTML(fmtPrice(svc.anchorPrice))}${escapeHTML(svc.priceLabel || '')}</div>
      <div style="font-size:12px;font-weight:800;color:#B0FF03;">Your contract rate: $${escapeHTML(fmtPrice(svc.price))}${escapeHTML(svc.priceLabel || '')}</div>
    </div>`;
        } else {
          pricingHTML = `<div style="text-align:right;margin-top:10px;font-size:12px;font-weight:800;color:#B0FF03;">${isIncluded ? 'Included' : `$${escapeHTML(fmtPrice(svc.price))}${escapeHTML(svc.priceLabel || '')}`}</div>`;
        }

        return `
  <div class="card-no-break" style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:18px 20px;">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;">
      <div class="svc-name" style="font-weight:800;font-size:12px;color:#fff;">${escapeHTML(svc.name)}</div>
      <div style="font-size:10px;font-weight:700;color:#B0FF03;background:rgba(176,255,3,.08);padding:3px 10px;border-radius:6px;">${escapeHTML(svc.frequency)} &bull; ${escapeHTML(svc.season)}</div>
    </div>
    <ul style="padding-left:16px;margin:0;">
      ${svc.bullets.map((b) => `<li>${escapeHTML(b)}</li>`).join('\n      ')}
    </ul>
    ${pricingHTML}
  </div>`;
      }
    )
    .join('\n');

  // ── Annual savings callout ───────────────────────────────────────
  const savingsCallout = annualSavings > 0 ? `
<div class="card-no-break" style="background:rgba(34,197,94,.08);border:2px solid rgba(34,197,94,.35);border-radius:12px;padding:20px;text-align:center;margin:20px 0;">
  <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:rgba(255,255,255,.45);margin-bottom:6px;">Annual Savings With Your Contract</div>
  <div style="font-size:28px;font-weight:900;color:#4ade80;">$${escapeHTML(fmtPrice(annualSavings))}</div>
  <div style="font-size:10px;color:rgba(255,255,255,.35);margin-top:4px;font-weight:600;">compared to individual service pricing</div>
</div>` : '';

  // ── Plan section — show all tiers ───────────────────────────────────
  const allPlans = plans || (plan ? [plan] : []);
  const planSection = allPlans.length > 0 ? `
<h2>Choose Your Plan</h2>
<p style="margin-bottom:16px;font-size:10px;color:rgba(255,255,255,.5);font-weight:600;">All plans include the services listed above. Higher tiers add premium extras on top of everything in Total Care.</p>
<div style="display:flex;flex-direction:column;gap:16px;margin:16px 0;">
${allPlans.map((p) => {
  const isPopular = p.popular;
  const border = isPopular ? 'border:2px solid #B0FF03;background:rgba(176,255,3,.12)' : 'border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03)';
  return `
  <div class="card-no-break" style="${border};border-radius:12px;padding:20px;position:relative;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="font-weight:900;font-size:14px;color:#fff;">${escapeHTML(p.name)}</div>
        ${isPopular ? '<span style="font-size:9px;font-weight:800;color:#000;background:#B0FF03;padding:3px 12px;border-radius:4px;text-transform:uppercase;letter-spacing:1px;">Most Popular</span>' : ''}
      </div>
      <div style="font-size:14px;font-weight:900;color:#B0FF03;">${escapeHTML(p.monthlyPrice)} <span style="font-size:10px;font-weight:600;color:rgba(255,255,255,.5);">/month</span></div>
    </div>
    ${p.description ? `<p style="font-size:10px;color:rgba(255,255,255,.6);font-weight:600;margin-bottom:10px;">${escapeHTML(p.description)}</p>` : ''}
    ${p.extras && p.extras.length ? `<ul style="padding-left:16px;margin:0;">${p.extras.map((e) => `<li><strong>${escapeHTML(e.split(':')[0])}:</strong>${escapeHTML(e.split(':').slice(1).join(':'))}</li>`).join('')}</ul>` : ''}
  </div>`;
}).join('\n')}
</div>` : '';

  // ── Months label ───────────────────────────────────────────────────
  const monthsLabel =
    term.months === 12
      ? 'twelve (12) consecutive months'
      : `${term.months} consecutive month${term.months !== 1 ? 's' : ''}`;

  // ── Full document ──────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Hey Jude's Lawn Care — Annual Service Agreement</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  @page {
    size: letter;
    margin: 0;
  }

  body {
    font-family: 'Montserrat', -apple-system, system-ui, sans-serif;
    font-size: 11.5px;
    line-height: 1.55;
    color: #fff;
    background: #000;
  }

  .page {
    max-width: 8.5in;
    margin: 0 auto;
    background: #000;
  }

  /* Hero header */
  .hero-header {
    position: relative;
    background: linear-gradient(160deg, #0a0a0a 0%, #111 50%, #0a1a00 100%);
    padding: 48px 52px 40px;
    border-bottom: 3px solid #B0FF03;
    overflow: hidden;
  }
  .hero-header::before {
    content: "";
    position: absolute;
    top: -40%;
    right: -10%;
    width: 300px;
    height: 300px;
    background: radial-gradient(circle, rgba(176,255,3,.08) 0%, transparent 70%);
    border-radius: 50%;
  }
  .hero-header-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: relative;
    z-index: 1;
  }
  .hero-logo img {
    height: 56px;
    width: auto;
  }
  .hero-title {
    text-align: right;
  }
  .hero-title h1 {
    font-size: 24px;
    font-weight: 900;
    color: #fff;
    letter-spacing: -0.5px;
  }
  .hero-title p {
    font-size: 11px;
    color: rgba(255,255,255,.5);
    margin-top: 2px;
    font-weight: 600;
  }

  /* Content area */
  .content {
    padding: 32px 52px 40px;
  }

  /* Section titles */
  h2 {
    font-size: 12px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: #B0FF03;
    margin: 32px 0 14px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(255,255,255,.1);
  }
  h2:first-child { margin-top: 0; }

  h3 {
    font-size: 12px;
    font-weight: 700;
    color: rgba(255,255,255,.9);
    margin: 16px 0 6px;
  }

  p, li {
    font-size: 11px;
    color: rgba(255,255,255,.72);
    line-height: 1.65;
    font-weight: 500;
  }

  strong { color: rgba(255,255,255,.92); }

  ul, ol {
    padding-left: 18px;
    margin: 6px 0;
  }
  li { margin-bottom: 5px; }

  /* Editable fields */
  .field {
    display: inline-block;
    min-width: 160px;
    border-bottom: 1px solid rgba(255,255,255,.35);
    padding: 2px 6px;
    font-weight: 700;
    color: #fff;
  }
  .field-short { min-width: 70px; }
  .field-med { min-width: 110px; }

  /* Client info grid */
  .info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px 32px;
    margin: 14px 0;
  }
  .info-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-size: 11px;
  }
  .info-label {
    font-weight: 700;
    color: rgba(255,255,255,.5);
    white-space: nowrap;
    min-width: 95px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .info-value {
    flex: 1;
    border-bottom: 1px solid rgba(255,255,255,.25);
    padding: 2px 4px;
    min-height: 20px;
  }

  /* Service table */
  .service-table {
    width: 100%;
    border-collapse: collapse;
    margin: 14px 0;
    font-size: 10.5px;
  }
  .service-table th {
    background: rgba(176,255,3,.08);
    font-weight: 800;
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #B0FF03;
    padding: 10px 12px;
    text-align: left;
    border-bottom: 1px solid rgba(176,255,3,.2);
  }
  .service-table td {
    padding: 10px 12px;
    border-bottom: 1px solid rgba(255,255,255,.06);
    vertical-align: top;
    color: rgba(255,255,255,.78);
    font-weight: 500;
  }
  .service-table .svc-name {
    font-weight: 700;
    color: rgba(255,255,255,.92);
    font-size: 11px;
  }
  .service-table .svc-desc {
    font-size: 9.5px;
    color: rgba(255,255,255,.45);
    font-weight: 500;
    margin-top: 2px;
  }
  .service-table .total-row td {
    font-weight: 900;
    font-size: 12px;
    color: #fff;
    background: rgba(176,255,3,.06);
    border-top: 1px solid rgba(176,255,3,.25);
    border-bottom: 2px solid #B0FF03;
    padding: 12px;
  }

  /* Callout box */
  .callout {
    background: rgba(176,255,3,.06);
    border: 1px solid rgba(176,255,3,.2);
    border-radius: 10px;
    padding: 16px 20px;
    margin: 16px 0;
    font-size: 11px;
  }
  .callout strong {
    color: #B0FF03;
    font-size: 13px;
  }

  /* Signature block */
  .sig-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 40px;
    margin-top: 36px;
  }
  .sig-label {
    font-size: 9.5px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: #B0FF03;
    margin-bottom: 6px;
  }
  .sig-line {
    border-bottom: 1px solid rgba(255,255,255,.25);
    height: 32px;
    margin-bottom: 4px;
  }
  .sig-sub {
    font-size: 9px;
    color: rgba(255,255,255,.35);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* Feature strip */
  .feature-strip {
    display: flex;
    gap: 24px;
    justify-content: center;
    padding: 14px 0;
    margin: 20px 0 0;
    border-top: 1px solid rgba(255,255,255,.06);
  }
  .feature-pill {
    font-size: 9.5px;
    font-weight: 800;
    color: rgba(255,255,255,.5);
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .feature-pill span {
    color: #B0FF03;
    margin-right: 4px;
  }

  /* Footer */
  .doc-footer {
    margin-top: 36px;
    padding-top: 16px;
    border-top: 1px solid rgba(255,255,255,.08);
    text-align: center;
    font-size: 9.5px;
    color: rgba(255,255,255,.3);
    font-weight: 600;
  }

  /* Page break */
  .page-break {
    page-break-before: always;
  }

  @media print {
    html, body { background: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; height: 100%; }
    .page { min-height: 100vh; }
    .no-print { display: none; }
    .hero-header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    /* Keep service/plan cards whole — don't split across pages */
    .card-no-break {
      break-inside: avoid;
      page-break-inside: avoid;
      padding-top: 24px;
    }
  }
</style>
</head>
<body>

<!-- Print button -->
<div class="no-print" style="text-align:center;padding:20px;">
  <button onclick="window.print()" style="padding:12px 32px;font-size:14px;font-weight:800;background:#B0FF03;color:#000;border:none;border-radius:10px;cursor:pointer;font-family:Montserrat;">Save as PDF</button>
</div>

<div class="page">

<!-- HERO HEADER -->
<div class="hero-header">
  <div class="hero-header-inner">
    <div class="hero-logo">
      <img src="https://assets.cdn.filesafe.space/Umlo2UnfqbijiGqNU6g2/media/69a0cc399185ff63f8649cd6.png" alt="Hey Jude's Lawn Care" />
    </div>
    <div class="hero-title">
      <h1>Annual Service Agreement</h1>
      <p>Rock Hill, SC &bull; (803) 902-7447 &bull; heyjudeslawncare.com</p>
    </div>
  </div>
</div>

<div class="content">

<p style="font-size:10px;color:rgba(255,255,255,.45);font-weight:600;font-style:italic;margin-bottom:24px;">This agreement is attached to and forms part of your service quote. By signing the quote, you agree to the terms outlined below.</p>

<!-- CLIENT INFO -->
<h2>Client Information</h2>
<div class="info-grid">
  <div class="info-row">
    <span class="info-label">Full Name</span>
    <span class="info-value">${escapeHTML(client.name || '')}</span>
  </div>
  <div class="info-row">
    <span class="info-label">Phone</span>
    <span class="info-value">${escapeHTML(client.phone || '')}</span>
  </div>
  <div class="info-row">
    <span class="info-label">Email</span>
    <span class="info-value">${escapeHTML(client.email || '')}</span>
  </div>
  <div class="info-row">
    <span class="info-label">Service Address</span>
    <span class="info-value">${escapeHTML(client.address || '')}</span>
  </div>
  <div class="info-row">
    <span class="info-label">City / State / Zip</span>
    <span class="info-value">${escapeHTML(client.cityStateZip || '')}</span>
  </div>
</div>

<!-- AGREEMENT TERM -->
<h2>Agreement Term</h2>
<p>This agreement begins <strong>${escapeHTML(term.startDate)}</strong> and continues for a period of <strong>${monthsLabel}</strong>, ending <strong>${escapeHTML(term.endDate)}</strong>. Services will automatically renew for an additional 12-month term unless either party provides written notice at least 30 days prior to the renewal date.</p>

<!-- WHAT'S INCLUDED -->
<h2>What's Included</h2>
<ul>
  <li>Sharp curb appeal, zero stress — we handle everything so you don't have to</li>
  <li>All labor, equipment, and materials are provided by Hey Jude's Lawn Care — fully covered under this agreement</li>
  <li>Day-before service reminders and on-the-way texts</li>
  <li>Clean-up after every service (blowing walkways, driveways, etc.)</li>
  <li>Each service is scheduled during its optimal season — mowing Mar–Oct, leaf maintenance Nov–Feb, hedge trimming Apr/Jul/Oct, aeration &amp; overseeding in Fall or Spring, and mulch in Spring</li>
  <li>Satisfaction guarantee — not happy with a visit? Let us know within 48 hours and we'll come back and make it right at no additional cost</li>
</ul>

<!-- SERVICES INCLUDED -->
<h2>Services Included</h2>
<p>The following services are included in this agreement. All services are scheduled and performed by Hey Jude's Lawn Care according to the frequency listed below.</p>

<!-- Service Breakdown Cards -->
<div style="display:flex;flex-direction:column;gap:16px;margin:16px 0;">
${serviceCards}
</div>

${savingsCallout}

${planSection}

<!-- PRICING -->
<div class="card-no-break">
<h2>Pricing &amp; Payment</h2>
<div class="callout">
  <span style="color:rgba(255,255,255,.55);">Your selected plan's total annual cost is divided into 12 equal monthly payments. Same price every month, year-round.</span>
</div>
<ul>
  <li><strong>First billing date:</strong> ${escapeHTML(term.startDate)}. Services begin immediately; your first monthly payment is due on your first billing date.</li>
  <li><strong>Billing:</strong> Client will be billed on the 1st of each month via autopay.</li>
  <li><strong>Payment method:</strong> Credit card or ACH on file. Your card is charged automatically each month, just like a subscription. No invoices to remember, no manual payments.</li>
  <li><strong>Late payments:</strong> Payments not received within 7 days of the billing date may result in a temporary pause of services until the balance is resolved.</li>
  <li><strong>Price lock:</strong> Pricing is locked for the 12-month term. Any changes will be discussed and agreed upon in writing before renewal.</li>
</ul>
<div class="feature-strip">
  <div class="feature-pill"><span>&#10003;</span> Licensed &amp; Insured</div>
  <div class="feature-pill"><span>&#10003;</span> No Surprise Fees</div>
  <div class="feature-pill"><span>&#10003;</span> Perfect 5.0 Rating Across 100+ Reviews</div>
</div>
</div>

<!-- SCHEDULE -->
<div class="card-no-break">
<h2>Scheduling &amp; Service Visits</h2>
<ul>
  <li>Services are performed <strong>weekly, year-round</strong>, for predictable service and consistent curb appeal.</li>
  <li>If weather or conditions prevent service, we will notify you of your updated service date.</li>
  <li>Seasonal services (aeration, leaf cleanup, mulch) are scheduled during their optimal windows and coordinated with you in advance.</li>
  <li>You will receive a reminder the day before your service and an on-the-way text when our crew is headed to your property.</li>
  <li>All schedule changes are communicated via text or phone.</li>
</ul>
</div>

<!-- CANCELLATION -->
<div class="card-no-break">
<h2>Cancellation &amp; Early Termination</h2>
<ul>
  <li><strong>Cancellation with notice:</strong> Either party may cancel by providing <strong>30 days written notice</strong> (email or text).</li>
  <li><strong>Early termination:</strong> If Client cancels before the 12-month term is complete, any seasonal services already performed but not yet fully paid off through monthly payments (e.g., mulch installation, aeration &amp; overseeding) will be billed in full at their retail price. An additional early termination fee of $200 will also apply. That said, our goal is to make sure you never want to cancel — every visit is backed by our satisfaction guarantee, and if something isn't right, we'll come back and fix it at no extra cost.</li>
  <li><strong>Cancel free if we don't show:</strong> If Hey Jude's Lawn Care fails to perform services as agreed, Client may cancel without penalty after written notice and a 14-day cure period.</li>
  <li><strong>Refunds:</strong> No refunds for services already performed. If a seasonal service has not yet been performed, that portion will be credited or refunded.</li>
</ul>
</div>

<!-- CLIENT RESPONSIBILITIES -->
<div class="card-no-break">
<h2>Client Responsibilities</h2>
<ul>
  <li>Ensure service areas are accessible on scheduled days (gates unlocked or unlockable from outside, vehicles moved away from grass, pets secured)</li>
  <li>Remove dog toys, hoses, and other loose items from the lawn before service. If our crew has to spend more than 5 minutes clearing the lawn before work can begin, a $10 cleanup fee will be applied.</li>
  <li>Maintain a valid payment method on file for the duration of this agreement</li>
  <li>Notify us of any changes to property access, contact info, or special requests</li>
</ul>
</div>

<!-- SATISFACTION + LIABILITY + FOOTER grouped together -->
<div class="card-no-break">
<h2>Satisfaction Guarantee</h2>
<p>Not happy with a service visit? Let us know within 48 hours and we'll come back and make it right at no additional cost. We stand behind every job.</p>

<h2>Liability &amp; Property</h2>
<ul>
  <li>Hey Jude's Lawn Care is licensed and insured. We carry general liability insurance for your protection.</li>
  <li>If any damage occurs as a direct result of our work, we will repair or compensate for it.</li>
  <li>We are not responsible for pre-existing conditions, unmarked underground utilities, or damage caused by weather or factors outside our control.</li>
</ul>

<p style="margin-top:24px;font-size:11px;color:rgba(255,255,255,.55);font-weight:600;">Upon approval of this quote, we will send you your scheduled service dates.</p>

<div class="doc-footer">
  Hey Jude's Lawn Care &bull; Rock Hill, SC &bull; (803) 902-7447 &bull; heyjudeslawncare.com
</div>
</div>

</div><!-- /content -->
</div><!-- /page -->

</body>
</html>`;
}

/** Escape HTML special characters to prevent XSS / broken markup */
function escapeHTML(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
