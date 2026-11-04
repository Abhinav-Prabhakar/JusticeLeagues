import { Lead, Wins } from "../components/Front";
import { Standings } from "../components/Standings";
import { Numbers } from "../components/Numbers";
import { Dispatch } from "../components/Dispatch";
import { Atlas } from "../components/Atlas";
import { Ledger } from "../components/Ledger";
import { Classifieds } from "../components/Classifieds";
import { Charter } from "../components/Charter";
import { Reveal } from "../ui";

export default function Home() {
  return (
    <>
      <div className="space-y-20 pt-8 md:space-y-24 md:pt-10">
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <Lead />
            <Wins />
          </div>
          <div className="lg:col-span-4">
            <div className="lg:sticky lg:top-20">
              <Standings />
            </div>
          </div>
        </div>

        <Reveal>
          <Numbers />
        </Reveal>
        <Dispatch />
        <Atlas />
        <Ledger />
        <Classifieds />
      </div>
      <Charter />
    </>
  );
}
