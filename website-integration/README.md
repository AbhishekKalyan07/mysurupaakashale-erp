# Website Integration Guide

## What This Does
1. Changes "Subscribe Now" and "Order Now" buttons on mysurupaakashale.in to link to app.mysurupaakashale.in
2. Adds a beautiful PWA install banner so users can install the ERP app on their phones

## Step-by-Step

### 1. Update Subscribe Buttons
In your main website's `index.html`, find the two "Subscribe Now" buttons and replace their WhatsApp links:

**Basic Plan** — Change:
```html
<a href="https://wa.me/919740850555?text=Hi! I want to subscribe to the Basic Monthly Plan (₹159/day)"
```
To:
```html
<a href="https://app.mysurupaakashale.in/signup?plan=basic"
```

**Regular Plan** — Change:
```html
<a href="https://wa.me/919740850555?text=Hi! I want to subscribe to the Regular Monthly Plan (₹210/day)"
```
To:
```html
<a href="https://app.mysurupaakashale.in/signup?plan=regular"
```

### 2. Update "ORDER NOW" in Navbar
Change the nav CTA button's onclick to navigate instead of scroll:
```html
<button class="nav-cta" aria-label="Order from Mysuru Paakashale"
  onclick="window.location.href='https://app.mysurupaakashale.in/signup'">
  ORDER NOW
</button>
```

### 3. Add the PWA Install Banner
Copy `pwa-install-banner.html` just before `</body>` in your `index.html`.
Copy `pwa-install-banner.css` to the end of your `assets/css/styles.css`.

### 4. Add "My Account" Link
In navbar `<ul class="nav-links">`, add as the last item:
```html
<li><a href="https://app.mysurupaakashale.in/login" class="nav-account-link">My Account</a></li>
```

In mobile menu, add:
```html
<a href="https://app.mysurupaakashale.in/login" onclick="closeMobile()">My Account</a>
```
