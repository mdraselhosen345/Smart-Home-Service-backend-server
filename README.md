# Real Brothers Shop – Backend (API + Admin)

Node.js + Express + MongoDB. Login is done by Firebase on the frontend; this server only
**verifies** the Firebase ID token. Admins are the Firebase accounts listed in `ADMIN_EMAILS`
(email must be verified – Google login is verified automatically).

## Run locally

```bash
cd backend
npm install
cp .env.example .env        # then fill it in (see below)
npm run seed                # loads the 5 starter products from ../public/shope.json
npm run dev                 # http://localhost:5000
npm test                    # API tests (downloads a temporary MongoDB the first time)
```

Frontend: copy `../.env.example` to `../.env`, set `VITE_API_URL=http://localhost:5000`, run `npm run dev`
in the project root.

## .env (backend)

| Variable | What |
|---|---|
| `MONGODB_URI` | MongoDB Atlas (free tier is fine) or local connection string |
| `CLIENT_ORIGINS` | Your website URL(s), comma separated, no trailing slash. Example: `https://realbrothers.com,http://localhost:5173` |
| `ADMIN_EMAILS` | Admin email(s). Only these can use the admin panel |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase Console → Project settings → Service accounts → Generate new private key. Paste the JSON on ONE line (or base64) |
| `DELIVERY_CHARGE` | Flat delivery charge added to every order (0 = free) |
| `TRUST_PROXY` | `1` on Render / Railway / Nginx |

Never commit `.env` or the service-account key.

## API

Responses are `{ success, data, pagination? }` or `{ success:false, message, details? }`.

**Public**
- `GET /api/products?search=&category=&brand=&minPrice=&maxPrice=&sort=newest|price_asc|price_desc|rating&page=&limit=`
- `GET /api/products/categories` · `GET /api/products/:id`
- `POST /api/orders` – prices are read from the database, stock is reserved atomically
- `GET /api/orders/mine` (login) · `GET /api/orders/track?orderNo=&phone=`
- `POST /api/service-requests` · `POST /api/complaints` · `POST /api/contacts`
- `GET /api/auth/me` (login) → `{ isAdmin }`

**Admin** (`/api/admin/*`, admin login required)
- `GET /stats` – dashboard numbers, recent orders, last 7 days
- `/products` – list, get, create, `PATCH|PUT /:id`, delete
- `/orders` – list/filter/search, get, `PATCH /:id/status`, `PATCH /:id/payment`, delete
- `/services`, `/complaints` – list, `PATCH /:id`, delete
- `/contacts` – list, `PATCH /:id {isRead}`, delete
- `GET /customers`, `GET /payments`

## Behaviour worth knowing

- Cancelling an order puts the stock back (once). Re-opening it takes the stock again, or fails with 409 if it is gone.
- Deleting an order that has not shipped restores its stock; deleting a delivered one does not.
- A cash-on-delivery order becomes **Paid** when marked **Delivered**. bKash/Nagad/Rocket orders stay **Pending** until the admin verifies the TrxID and sets **Paid**.
- "Customers" are everyone who ordered or booked a service, grouped by phone number.
- Home-service catalog cards (`public/homeservice.json`) and the product seed are still static files; only bookings are stored in the database.

## Deploy (example: Render + MongoDB Atlas)

1. Atlas: create a free cluster, a database user, allow access from anywhere (or Render's IPs), copy the connection string.
2. Render → New Web Service from this repo, **Root directory** `backend`, build `npm install`, start `npm start`.
3. Add the environment variables above (`NODE_ENV=production`, `TRUST_PROXY=1`).
4. Run `npm run seed` once (Render shell, or locally with the Atlas URI in `.env`).
5. Frontend host (Vercel/Netlify): set `VITE_API_URL` to the Render URL and the Firebase `VITE_*` values; add the site's domain to `CLIENT_ORIGINS`, and to Firebase → Authentication → Authorized domains.
