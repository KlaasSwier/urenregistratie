# Urenregistratie – Firebase versie

Inlog per medewerker (e-mail + wachtwoord), opslag in Firestore, en admin-overzicht.

## Snel starten
1. Ga naar https://console.firebase.google.com → **Create project**
2. **Authentication** → **Sign-in method** → **Email/Password** = Enabled
3. **Firestore Database** → Create (Production) → Region EU (`europe-west4`/`eur3`)
4. **Project settings** → **Your apps** → **Web app** → pak de **config** en plak die in `firebase-config.js`
5. **Firestore Rules** → vervang met de inhoud van `firestore.rules.txt` en **Publish**
6. Deploy de map naar Vercel (static site).

## Rollen
- Nieuwe registraties krijgen standaard rol `user` (aangemaakt in `/users/{uid}` bij registratie).
- Maak een admin door in Firestore bij `/users/{uid}` het veld `role: 'admin'` te zetten.

## Datamodel
- `/users/{uid}`: `{ email, role }`
- `/users/{uid}/entries/{doc}`: `{ voorWie, datum, month, starttijd, eindtijd, pauze, uren, opmerkingen, goedgekeurd, email, createdAt }`
