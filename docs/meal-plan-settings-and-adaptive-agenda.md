# Essensplan-Einstellungen und adaptive Agenda: lokale Abnahme

Stand: 16. November 2026. Basis: `1f3554d`, Branch: `feature/meal-plan-settings-adaptive-agenda`.

## Verhalten

- **Einstellungen → Essensplan** ist als eigene geschützte Seite in Übersicht und Seitenmenü erreichbar. Aktive Mitglieder und Administratoren können ein Bild hochladen, ersetzen, vergrößern und nach Bestätigung löschen. Die Seite zeigt Name, Bildabmessungen und Uploaddatum im Stil der Familienfotoverwaltung.
- Im Dashboard verbleiben ausschließlich Vorschau und Vergrößerung. Der Leerzustand verweist auf die Einstellungen. API, Dateispeicherung, Berechtigungen und Achtsekundenaktualisierung werden wiederverwendet; keine neue Migration.
- Je Kalendertag wird die größte passende Dichtestufe gewählt: 17 px/26 px/250 px, 16 px/24 px/220 px oder 14 px/20 px/190 px (Titel/Zeile/Mindestspaltenbreite). Uhrzeiten bleiben mindestens 14 px groß. Bei echtem Platzmangel bleiben alle weiteren Termine im Tagesdialog erreichbar; der Hinweis steht im Tageskopf.
- Sieben gleich hohe Tagesbereiche und der rechte Monatskalender bleiben erhalten. In kleinen Computerfenstern ist der Kalender 720–900 px hoch begrenzt; seine Kinder wachsen nicht über ihn hinaus. Der Hochformat-Kiosk behält seine bestehenden fünf Höhenanteile.

## Fehlerursache im lokalen Docker-Frontend

Auf Port 8081 waren die Dateien im Container bytegleich zum Repository, die von Vite ausgelieferten Transformationen enthielten aber noch `usePreviewCapacity(events.length, 40)` und veraltete CSS-Regeln. Eine bloße HTTP-Erreichbarkeitsprüfung hatte dies nicht erkannt.

Nur der Frontend-Dienst wurde mit Docker-spezifischem Polling (1000 ms) neu erstellt. API-, Kamera- und Datenbankcontainer behalten ihre IDs. Die anschließend ausgelieferten Module enthalten `useAgendaPreviewLayout` und die adaptiven CSS-Variablen. Auch eine spätere Höhenänderung wurde ohne weiteren Neustart erkannt und ausgeliefert. Der Proxy auf 8081 bleibt gesund; 8002 wird weiterhin nicht veröffentlicht.

## Prüfung

- 47 Frontend-Komponententests erfolgreich, darunter Rechte-/Routingprüfung für beide Rollen, abgebrochene Dateiauswahl, schreibgeschützte Dashboardkachel, Fehlererhalt und Bilddialog.
- 13 Browserprüfungen direkt auf **http://localhost:8081**, ausschließlich mit synthetischen API-Antworten. Keine Uploads oder Änderungen an bestehenden Haushaltsdaten durch diese Tests.
- Zusätzlicher echter Browser-Integrationstest gegen einen separaten API-Testserver mit zwei Prozessen und flüchtiger PostgreSQL-Testdatenbank: Konten/Anmeldung, Upload über die Einstellungsseite, Neuladen, zweiter Browser, Austausch, ungültige Bilddatei und Löschen erfolgreich.
- Echte Browserregression bei 520 × 60 Pixeln Inhaltsfläche: sechs sichtbare Termine mit 14 px, statt zuvor vier. Tests mit 0/4/5/8/12/50 Ereignissen sowie 1440 × 900, 1280 × 800 und 1024 × 768. Die fünf Termine eines Tages sind in allen drei Computergrößen gleichzeitig sichtbar; mindestens zwölf je Tag bleiben bei 1440 × 2560 sichtbar.
- Gemessen werden gleiche Tageshöhen, Bereichsgrenzen, Mindestschriftgrößen und vollständige Erreichbarkeit aller Termine. Visuell geprüft: Smartphone-Essensplanverwaltung und Kalender bei 1280 × 800.
- Formatprüfung, TypeScript, ESLint und Produktionsbuild ergänzen die Tests.

Referenzbilder: `frontend/tests/artifacts/meal-plan-settings-smartphone.png` und `frontend/tests/artifacts/calendar-adaptive-1280x800.png`.

## Übergabe

Die vorstehende Abnahme wurde lokal auf **http://localhost:8081** durchgeführt, Verwaltung unter **/settings/meal-plan**. Der Benutzer hat anschließend die Veröffentlichung auf GitHub und den VPS-Rollout freigegeben. Die produktive Sichtprüfung erfolgt nach dem Rollout.
