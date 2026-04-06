---
name: catalan-style
description: Regles essencials per escriure textos de qualitat en català. Aplica-la sempre que hagis d'escriure qualsevol text visible per a l'usuari final, documentació o missatges del sistema. Per a la guia completa amb exemples, consulta catalan-style-referencia.md.
---

# Guia d'estil per als textos en català

Basada en la [Guia d'estil de Softcatalà](https://www.softcatala.org/guia-estil-de-softcatala/).
Versió detallada amb tots els exemples: [`.agents/skills/catalan-style-referencia.md`](.agents/skills/catalan-style-referencia.md).

---

## Regles obligatòries

Aplica sempre totes aquestes regles sense excepció:

1. **Claredat i naturalitat**: frases curtes, ordre lògic (Subjecte + Verb + Complements). Evita subordinades innecessàries. El text no ha de semblar una traducció.
2. **Tractament de vós**: quan l'ordinador/sistema s'adreça a l'usuari, usa la 2a persona del plural («Escriviu», «Premeu», «Heu trobat»). El plural no implica més d'una persona.
3. **Imperatiu per a accions d'usuari → ordinador**: usa imperatiu **singular** (tractament de «tu») per a botons, menús i opcions de configuració. «Edita», «Obre», «Desa» — mai infinitiu.
4. **Imperatiu per a ordres del sistema → usuari**: usa imperatiu **plural** (tractament de «vós»). «Seleccioneu», «Introduïu», «Confirmeu».
5. **Veu activa**: converteix les frases passives angleses a forma activa o reflexiva. «S'ha desat el fitxer.» (no «El fitxer ha estat desat.»)
6. **No humanitzis el programari**: elimina «Sorry», «Please», «Simply», ¡/¿ i onomatopeies. «Aquest nom ja existeix.» (no «Em sap greu, aquest nom ja existeix.»)
7. **Cometes baixes catalanes**: usa « » (no "" ni ''). Si hi ha cometes dins cometes: « ... " ... " ... ».
8. **Negació correcta**: «ni» (no «o») en negatives. Doble negació obligatòria: «no ... mai», «no ... cap», «no ... res», «no ... ningú».
9. **Evita anglicismes i castellanismes**: utilitza el lèxic genuí català. Consulta l'Apèndix de la referència si tens dubtes.
10. **Gerundi**: mai com a adjectiu («fitxer contenint» ❌). Usa relatives: «fitxer que conté».

---

## Per a i per (finalitat vs. causa)

- **«per a»** → destinatari o finalitat: «Programa per a comprimir fitxers.», «per a accedir al sistema».
- **«per»** → agent, causa o cosa pendent: «Traduït per Softcatalà.», «Gràcies per visitar-nos.», «Fitxer per baixar.»

---

## To i formalitat

- To formal però directe; evita expressions col·loquials angleses.
- Neutralitza el gènere sempre que sigui possible: «Tothom», «L'equip de traducció», «Publicat per».
- Evita l'ús explícit de «vós» quan es pot prescindir-ne: «Genereu una clau pròpia.» (no «per a vós mateix»).
- Ometi el possessiu quan sigui evident: «Voleu eliminar el fitxer?» (no «el vostre fitxer»).
- Usa construccions positives: «Recordeu-vos de desar.» (no «No us oblideu de desar.»)

---

## Gramàtica: punts clau

- **Ordre**: informació general primer, detalls després. «Al menú Fitxer, trieu Obre.» (no «Trieu Obre al menú Fitxer.»)
- **Article**: afegeix articles que l'anglès omet. «S'està baixant **el** correu.», «Seleccioneu **una** ubicació.»
- **Pronom «es»**: davant s-, ce-, ci- → «se». «Se sap que...», «Les propietats se sumen a les de...»
- **«en» vs. «a»**: moviment → sempre «a». Localització estàtica: davant topònims «a», davant abstractes «en», tots els altres casos «en».
- **Gerundi**: no per a accions no simultànies. Alternativa: «S'ha produït un error i el fitxer s'ha fet malbé.» (no «…fent-se malbé el fitxer.»)
- **«should»**: no «hauríeu de». Usa «és recomanable que» + subjuntiu, o futur si indica conseqüència.
- **Adverbis en «–ment»**: evita'ls si hi ha alternativa. «Mal configurat.» (no «Configurat incorrectament.»)
- **Complement + substantiu**: el complement va després en català. «Fitxer nou» (no «Nou fitxer»), «els passos següents» (no «els següents passos»).
- **Perquè** (no «per tal que»), **per a** (no «per tal de»): formes modernes i breus.

---

## Aspectes convencionals

- **Punts suspensius**: enganxats al mot anterior: «S'està carregant...». No combineu «etc.» i «...».
- **Coma**: en enumeracions, sense coma davant «i» o «o». «Menús, barres d'eines i tecles.»
- **Majúscules**: menys que en anglès. Noms genèrics i de llengua en minúscula: «navegador», «editar l'html», «català», «anglès».
- **Llistes**: frases completes → majúscula inicial + punt final. Elements nominals → majúscula inicial, sense punt.
- **Sigles**: en majúscules, sense punts. «USB», «HTML». Apostrofació per com es llegeix: «l'HTML», «la RAM», «el PC». Sense plural amb «-s»: «els CD-ROM».
- **Abreviatures**: amb punt final. «p. ex.», «núm.», «màx.», «mín.»
- **Guionet**: prefixos sense guionet («antivirus»). Compostos per evitar lectures errònies: «porta-retalls».

---

## Localització i formats

- **Nombres**: milers amb punt, decimals amb coma: `1.234.567,89`.
- **Data**: `dia/mes/any` o «11 de setembre de 2000». Hora en 24h: `17:15`.
- **Moneda**: símbol darrere amb espai: `1.000 €` (no `€1.000`).
- **Percentatges**: sense espai: `10%`.
- **Tecles**: «Retorn», «Supr», «Bloq Maj», «Maj», «Esc», «Av Pàg». Combinacions: `Ctrl+P`.
- **Errors**: «S'ha produït un error en obrir el fitxer.» (no «Error en obrir el fitxer.»)
- **Ordinals**: `1r`, `2n`, `3a`, `4t`, `5è`.
- **Locale**: preferentment `ca`; variants: `ca_ES`, `ca@valencia`.

---

## Errors freqüents i barbarismes

Formes correctes — usa sempre la columna de la dreta:

| ❌ Evita                 | ✅ Usa                           |
| ------------------------ | -------------------------------- |
| donat que                | atès que                         |
| doncs (causal)           | ja que / perquè                  |
| en quant a               | pel que fa a / quant a           |
| hi han                   | hi ha                            |
| tals com                 | com ara                          |
| tenir que                | haver de / caldre                |
| contrasenya/contrassenya | contrasenya                      |
| búsqueda                 | cerca                            |
| tamany                   | mida                             |
| recolzar (figurat)       | donar suport                     |
| tarja (TIC)              | targeta                          |
| programaris              | programari (invariable)          |
| library                  | biblioteca (no «llibreria»)      |
| remove / remoure         | eliminar / treure                |
| suportar (tècnic)        | ser compatible amb / permetre    |
| actual (calc anglès)     | real / actual (verificar sentit) |
| simplement               | (no traduïu «simply»)            |
| varis/varies             | diversos/diverses                |

**Tipografia**: apòstrof tipogràfic `'` (no `´`). Ela geminada amb punt volat: `l·l` (no `l.l`).

**El web o la web?**: «el web» (sistema/lloc web). «la pàgina web» (pàgina concreta).

---

## Checklist de revisió final

Abans de lliurar qualsevol text en català, verifica:

- [ ] Tractament de **vós** correcte — sistema → usuari usa 2a plural.
- [ ] Botons i menús en **imperatiu singular** («Desa», «Obre», «Edita»).
- [ ] Sense **anglicismes o castellanismes** lèxics (cerca la paraula a la taula d'errors freqüents si tens dubtes).
- [ ] **Cometes baixes** « » en tots els usos de cometes.
- [ ] **Veu activa** — no passiva sintètica calcada de l'anglès.
- [ ] **Missatges d'error** amb «S'ha produït un error...» si l'espai ho permet.
- [ ] **Números, dates i moneda** en format català (`1.234,56`, `dia/mes/any`, `€` darrere).
- [ ] **Cap expressió humanitzadora** del programari (Sorry, Please, etc.).
