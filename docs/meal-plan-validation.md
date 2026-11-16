# Kalenderlayout und Essensplan: lokale Abnahme

Stand: 16. November 2026. Branch: `feature/bounded-layout-meal-plan`, Ausgangsbasis `4e27dea`.

## Ergebnis

- Dashboard bei 1440 × 2560 vollständig sichtbar: fünf getrennte Bereiche, kein Seitenüberlauf, sieben gleich hohe Tage.
- Browserprüfung auch bei 1600 × 2844, 1309 × 2327 und 1152 × 2048 CSS-Pixeln (90/110/125-%-Zoomäquivalente), reduziertem Fenster 1440 × 2400 und der Untergrenze 900 × 1500. Smartphone/Tablet/Querformat separat geprüft.
- Belastungsdaten: 0/1/10/50 Termine pro Tag, 60 Einkaufsartikel und 50 Aufgaben. Gemessen werden Bereichsgrenzen und Vorschauinhalte; allein ausgeblendete Scrollbalken reichen nicht. Vollständige Tages- und Einkaufsdialoge geprüft.
- Echter Smartphone-Multipart-Upload gegen ein lokales FastAPI-Backend mit zwei Prozessen und isoliertem PostgreSQL: Anzeige auf einem zweiten Browser, Austausch, ungültiges Bild, Löschung und Neuladen bestanden.
- Tatsächlicher Neustart beider API-Prozesse: gespeicherte Bilddatei, Metadaten und Sitzung bleiben erhalten; Bild anschließend abrufbar.
- Migration vom bisherigen Kopf `20260822_0006` nach `20261116_0007` an einer bestehenden PostgreSQL-Testdatenbank durchgeführt; vorher angelegte synthetische Bestandsdaten bleiben erhalten.
- Parallele Erst-Uploads und Ersetzungen sowie ein gleichzeitiger Upload/Löschvorgang mit unabhängigen PostgreSQL-Sitzungen geprüft. Genau ein aktueller Plan und passende Dateien; kein Eingriff in Produktivdaten.
- Fehlgeschlagener Datenbank-Commit oder Dateiaustausch erhält den bisherigen Plan. Authentifizierung, CSRF, Herkunft, Pflichtpasswortwechsel, Haushaltsisolation, Bildformat und Größenlimits geprüft.

## Prüfungen

- Backend: pytest einschließlich optionalem PostgreSQL-Test und Coverage-Grenze, Ruff Format/Lint, MyPy, Alembic-Kopf.
- Frontend: Prettier, TypeScript, ESLint, Vitest, Produktionsbuild und alle acht Playwright-Tests.
- Referenzbilder: `frontend/tests/artifacts/dashboard-meal-plan-1440x2560.png`, aktualisierte Dashboard- und Kameraansichten. Alle dargestellten Inhalte sind synthetisch.

Der zusätzliche Aufgaben-Hook-Fix verhindert, dass der durch React StrictMode abgebrochene erste Abruf den unmittelbar folgenden Abruf blockiert. Eine Regression prüft das erste Laden ausdrücklich.

## Noch offen vor Produktivabnahme

Die neue Version wurde weder gemergt noch produktiv ausgerollt. Die Sichtprüfung im tatsächlichen Pi-Kiosk ist deshalb noch offen. Vorhandene lokale Dokumentation enthält keine auslesbare aktuelle Pi-Viewport-/Zoom-/Rotationskonfiguration; die bestätigte Zielkonfiguration ist 1440 × 2560 bei 100 %. Die lokalen Browsermessungen ersetzen keine physische Monitorabnahme oder einen Pi-Neustart.

Nach separat freigegebenem Deployment: im Pi-Chromium alle fünf Bereiche und die Lesbarkeit prüfen, Plan auf dem Smartphone ersetzen, Aktualisierung am Monitor beobachten, Kamera aktivieren/deaktivieren und nach einem normalen Pi-Neustart erneut prüfen. Bestehenden Datenbank- und Medienbackup-Ablauf verwenden.

Datenbank und Dateisystem sind nicht gemeinsam atomar: bei Prozessabbruch kann eine unreferenzierte Bilddatei verbleiben. Bereinigungsfehler werden protokolliert; der bereits erfolgreich gespeicherte aktuelle Plan bleibt gültig.

Abschließende Ergebnisse: 77 Backend-Tests bestanden (85,26 % Gesamt-Coverage), 39 Frontend-Tests bestanden, 8 Playwright-Tests bestanden. Format-, Lint- und Typprüfungen sowie Produktionsbuild erfolgreich.

## Nachbesserung: mehr direkt sichtbare Tagestermine

Der Monatskalender bleibt rechts sichtbar, mit einer Breite von 210–250 CSS-Pixeln. Tagestermine werden chronologisch in einem gemessenen mehrspaltigen Raster mit 26-Pixel-Zeilen angezeigt. Bei 1440 × 2560 sind zwölf Termine pro Tag (drei Spalten, vier Zeilen) direkt sichtbar. Eine Browserregression zeigt 84 Termine über alle sieben Tage vollständig innerhalb ihrer Tagesbereiche. Bei fünfzig Terminen bleiben zwölf direkt sichtbar; „+ 38 weitere“ steht im ohnehin anklickbaren Tageskopf und verdrängt keinen sichtbaren Termin. Der Tagesdialog enthält unverändert alle Termine mit vollständigen Angaben. Kleinere Fenster haben entsprechend weniger direkt sichtbare Einträge; die Tageshöhen bleiben gleich.

Die kompakte Zeile zeigt Uhrzeit, Kalenderfarbe und Titel. Vollständiger Titel, Kalenderzuordnung und Ort sind über Tooltip beziehungsweise Tagesdetails zugänglich. Dies vermeidet ein künstliches Ein- oder Zwei-Termin-Limit und nutzt die verfügbare Breite aus.

Docker lokal: genau ein laufendes Kitchen-Dashboard-Frontend auf Port 8081. Zehn unbenutzte ältere Kitchen-Dashboard-Test-/Release-Images gezielt entfernt. Die zwei verwendeten Anwendungsimages (Web und API), Kamera, PostgreSQL und alle Datenvolumes bleiben erhalten. Der laufende Entwicklungscontainer liefert die aktuellen Dateien über seinen vorhandenen Bind-Mount aus.

## Freigabe und lokaler Zugang

Der Benutzer hat die Ansicht auf Port 8081 abgenommen und den GitHub-/VPS-Rollout freigegeben. Die separate lokale Backend-Portfreigabe 8002 entfällt; das Backend bleibt im Compose-Netz für den Frontend-Proxy erreichbar. Die zuvor als offen dokumentierte Produktivabnahme mit echten Kalendern erfolgt nach diesem Rollout durch den Benutzer.
