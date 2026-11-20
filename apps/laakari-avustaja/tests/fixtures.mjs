// Synteettiset, keksityt testitapaukset. Eivät perustu oikeisiin potilaisiin.

export const CASES = {
  olkapaa: "45 v, oik olkapää 3 vk, ei traumaa, yöllä kipua, Burana auttaa vähän. Tee merkintä.",
  lahete: [
    "Tee lähete ortopedille. Tässä esitiedot, status ja kuvantamislöydös:",
    "52 v mies, vas polvi kipeä 2 kk, ei vammaa. Ibuprofeeni 400 mg 1x3 auttanut osittain, fysioterapia 6 vk ilman apua.",
    "Status: vas polvessa nestettä, mediaalinen nivelrako aristaa, Lachman neg.",
    "MRI vas polvi 3.10.2026: mediaalisen meniskin takasarven repeämä. Ei eturistisidevammaa.",
  ].join("\n"),
  bcEiTarkoitusta: "Tee B-lausunto. 34 v, masennus vuodesta 2025, sertraliini 100 mg, lyhytterapia 10 krt.",
  bcPsykoterapia: [
    "Tee B-lausunnon luonnos kuntoutuspsykoterapiaa varten:",
    "34 v sairaanhoitaja. Keskivaikea masennus F32.1 todettu 3/2025.",
    "Hoito: sertraliini 100 mg 8 kk, lyhytterapia 10 krt, jäännösoireita.",
    "Alkoholia satunnaisesti, ei muita päihteitä.",
    "Keskittyminen heikentynyt, opinnot viivästyneet, kotityöt jäävät tekemättä.",
    "Motivoitunut, kykenee vastavuoroiseen keskusteluun. Toivoo yksilöterapiaa.",
  ].join("\n"),
  puoliRistiriita: "60 v, oik olkapää kipeä 2 kk. Status: vasemmassa olkapäässä palpaatioarkuutta. Tee merkintä.",
  normaaliPoikkeava: "50 v, polvikipu. Status: polvi: ei turvotusta, liikelaajuudet täydet. Polvi turvoksissa, fleksio rajoittunut 90 asteeseen. Tee merkintä.",
  radiologi: [
    "Selitä tämä radiologin lausunto potilaalle ymmärrettävästi:",
    "Oikean olkapään UÄ: Supraspinatusjänteessä tendinoosia. Ei täyspaksuista repeämää. Subakromiaalinen bursiitti. Löydös sopii impingement-oireyhtymään.",
    "Suunnitelma: fysioterapiaohjaus, kontrolli 6 vk.",
  ].join("\n"),
  kaksiPotilasta: "45 v nainen, olkapääkipu. Potilas 2: 72 v mies, rintakipu. Tee merkintä.",
  epavarma: "Rtg vas ranne: epäillään scaphoideumin murtumaa. Tee merkintä.",
};
