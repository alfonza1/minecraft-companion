export default function SurvivalScene() {
  return <figure className="survival-scene">
    <img src={`${import.meta.env.BASE_URL}survival-teammates.png`} width="1280" height="1280" fetchPriority="high" alt="A human player carrying logs and an AI teammate mining iron beside their shared cottage, storage chest and furnace"/>
    <figcaption><span className="status-light"/> YOU + YOUR AI TEAMMATE<small>Concept illustration · not recorded gameplay</small></figcaption>
  </figure>;
}
