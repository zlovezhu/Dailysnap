import Nav from "./sections/Nav";
import Hero from "./sections/Hero";
import Demo from "./sections/Demo";
import Features from "./sections/Features";
import Companion from "./sections/Companion";
import Download from "./sections/Download";
import Contact from "./sections/Contact";
import Footer from "./sections/Footer";

export default function App() {
  return (
    <div className="paper-grain min-h-screen bg-paper text-ink">
      <Nav />
      <main>
        <Hero />
        <Demo />
        <Features />
        <Companion />
        <Download />
        <Contact />
      </main>
      <Footer />
    </div>
  );
}
