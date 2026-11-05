import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { Masthead, Nav } from "../components/Masthead";
import { Drawer } from "../components/Drawer";
import { Footer } from "../components/Footer";
import { RouteSkeleton } from "../components/RouteSkeleton";
import { ScrollToTop } from "../components/ScrollToTop";
import { usePagePulse } from "../lib/pulse";

export function RootLayout() {
  usePagePulse();

  return (
    <div id="top">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Masthead />
      <Nav />
      <main id="main" className="mx-auto max-w-[1320px] overflow-x-clip px-4 pb-20 md:px-8">
        <Suspense fallback={<RouteSkeleton />}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
      <Drawer />
      <ScrollToTop />
    </div>
  );
}
