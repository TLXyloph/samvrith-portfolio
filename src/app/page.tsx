import SignalLayer from "@/components/SignalLayer";
import AnnotationLayer from "@/components/ui/AnnotationLayer";
import ScrollProgress from "@/components/ui/ScrollProgress";
import Nav from "@/components/sections/Nav";
import Hero from "@/components/sections/Hero";
import About from "@/components/sections/About";
import Projects from "@/components/sections/Projects";
import OpenSource from "@/components/sections/OpenSource";
import Experience from "@/components/sections/Experience";
import Honors from "@/components/sections/Honors";
import Contact from "@/components/sections/Contact";
import Footer from "@/components/sections/Footer";

export default function Home() {
  return (
    <>
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-6 focus:left-6 focus:z-50 focus:rounded-full focus:border focus:border-hairline focus:bg-void focus:px-4 focus:py-2 focus:font-mono focus:text-[12px] focus:text-ink"
      >
        skip to content
      </a>

      <ScrollProgress />

      <SignalLayer />
      <AnnotationLayer />

      <Nav />

      <main id="content" className="relative z-10">
        <Hero />
        <About />
        <Projects />
        <OpenSource />
        <Experience />
        <Honors />
        <Contact />
      </main>

      <Footer />
    </>
  );
}
