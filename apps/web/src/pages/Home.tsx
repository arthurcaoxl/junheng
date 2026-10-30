import { Hero } from "../components/Hero";
import { BrandPerspective } from "../components/BrandPerspective";
import { MetabolismSignals } from "../components/MetabolismSignals";
import { CategoryDifference } from "../components/CategoryDifference";
import { ScienceCore } from "../components/ScienceCore";
import { MetricsWall } from "../components/MetricsWall";
import { NutritionStory } from "../components/NutritionStory";
import { FormulaStrength } from "../components/FormulaStrength";
import { MushroomBenefits } from "../components/MushroomBenefits";
import { MushroomKnowledge } from "../components/MushroomKnowledge";
import { ProcessStory } from "../components/ProcessStory";
import { MetabolismMechanism } from "../components/MetabolismMechanism";
import { Ritual } from "../components/Ritual";
import { PlateGuide } from "../components/PlateGuide";
import { SceneGuide } from "../components/SceneGuide";
import { MovementGuide } from "../components/MovementGuide";
import { BodyStandards } from "../components/BodyStandards";
import { Research } from "../components/Research";
import { CheckInEntry } from "../components/CheckInEntry";

export default function Home() {
  return (
    <>
      <Hero />
      <BrandPerspective />
      <MetabolismSignals />
      <CategoryDifference />
      <ScienceCore />
      <BodyStandards />
      <MetricsWall />
      <NutritionStory />
      <FormulaStrength />
      <MushroomBenefits />
      <MushroomKnowledge />
      <ProcessStory />
      <MetabolismMechanism />
      <Research />
      <Ritual />
      <PlateGuide />
      <SceneGuide />
      <MovementGuide />
      <CheckInEntry />
    </>
  );
}
