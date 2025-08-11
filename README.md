# Urenregistratie (statistische webapp)

Een simpele, mobiele webapp om uren te registreren. Werkt als statische site (geen server nodig) en kan gratis op Vercel worden gehost.

## Features
- Voor wie: Klaas Swier jr of Klaas sr (uitklap)
- Datum, starttijd, eindtijd, pauze, opmerkingen
- Automatische urenberekening (incl. nachtdienst over middernacht)
- Filter op persoon en maand
- Totaal uren per filter
- Goedkeuringsvinkje
- Export naar CSV
- Opslag in `localStorage` (per apparaat/browser)

## Deploy op Vercel
1. Upload deze map in een GitHub repository
2. Import het project in Vercel als **Other / Static Site**
3. Deploy – klaar! (geen build nodig)

## Eigen domein
Koppel `uren.klaasswier.nl` als CNAME naar `cname.vercel-dns.com.` in je DNS. Voeg het subdomein toe in de Vercel Project Settings > Domains.

## Ontwikkeling
Geen build tooling vereist. De app bestaat uit `index.html`, `style.css` en `app.js`.
