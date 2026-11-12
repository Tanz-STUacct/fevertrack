# FeverTrack

Temperature tracking and administration app for a 74 bed virus quarantine and treatment centre.
Built as a working prototype for the FactWise Technical Product Manager assessment.

## Run it
No build step and no dependencies. Open `index.html` through any static server, or deploy the folder to Vercel as is.

```
python3 -m http.server 8000   # then open http://localhost:8000
```

## Demo accounts
| Role | PIN |
|---|---|
| Nurse (Priya, Rahul, Anita) | 1111 |
| Doctor (Dr. Mehta, Dr. Khan) | 2222 |
| Admin (Sana) | 3333 |
| Head doctor (Dr. Rao) | 4444 |

Use **Simulate ▾** in the top bar to finish today's round, move to the next day or reset the demo data.
Open two tabs (for example nurse and doctor) to see screens sync live.

## Project structure
```
index.html            app shell
css/base.css          design tokens and components
css/layout.css        app shell, sidebar, timeline, print styles
js/store.js           state, persistence, live sync between tabs, audit log, notifications
js/logic.js           business rules (streaks, eligibility, outcomes, forecast) and all write actions
js/sim.js             30 day simulation used to generate demo history
js/ui.js              shared UI helpers and SVG charts
js/views-*.js         screens per role
js/app.js             hash router, role based access, app shell
```

## Key rules
* Fever means a reading at or above 38.0 °C (configurable).
* One official reading per patient per day. Corrections need a reason and are locked once a doctor has visited.
* Doctor visits are locked until today's temperature exists.
* Discharge eligibility is computed automatically after 3 consecutive fever free daily readings. A missed day resets the streak.
* Mortality is measured on closed cases only (deaths divided by deaths plus discharges).

Data lives in the browser (localStorage). A production build would move `store.js` onto a backend API with real authentication.
History before today is simulated demo data and is labelled as such inside the app.
