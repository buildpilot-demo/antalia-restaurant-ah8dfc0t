import { useEffect, useRef, useState } from "react";
import { siteConfig } from "../site.config";
import { EnquirySection } from "../components/EnquirySection";
import type { CinematicSiteConfig, SiteHeroChapter, SiteProductItem } from "../types/site-config";

// The single-page, three-section cinematic experience described in
// docs/DEVIN_3D_WEBSITE_SPEC.md: a scroll-scrubbed photo-sequence hero, a
// scroll-driven horizontal products/services rail, and a normal-flow
// enquiry section. Everything comes from siteConfig — no animation/3D
// libraries, no wheel/touch interception, no custom smooth scrolling.
// Only rendered by App.tsx when siteConfig.variant === "cinematic".
export function CinematicHome({ config }: { config: CinematicSiteConfig }) {
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    document.title = `${siteConfig.businessName} — ${siteConfig.purpose}`;
  }, []);

  return (
    <div id="top">
      <CinematicHero config={config} reducedMotion={reducedMotion} />
      <ProductsRail config={config} reducedMotion={reducedMotion} />
      <EnquirySection />
    </div>
  );
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

/** Normalized scroll progress (0-1) of a pinned track through the viewport. */
function trackProgress(track: HTMLElement): number {
  const rect = track.getBoundingClientRect();
  const scrollable = rect.height - window.innerHeight;
  if (scrollable <= 0) return 0;
  return Math.min(1, Math.max(0, -rect.top / scrollable));
}

/**
 * Opacity for a chapter at the given hero progress: full inside its
 * configured range, ramped at both edges so neighbouring chapters
 * crossfade instead of popping. Ranges that touch 0 or 1 stay pinned open
 * at that end so the first frame and last frame are never blank.
 */
function chapterOpacity(progress: number, chapter: SiteHeroChapter): number {
  const span = Math.max(0.0001, chapter.to - chapter.from);
  const ramp = Math.min(0.08, span / 3);
  if (progress <= chapter.from - ramp || progress >= chapter.to + ramp) return 0;
  const fadeIn = chapter.from <= 0 ? 1 : Math.min(1, Math.max(0, (progress - (chapter.from - ramp)) / ramp));
  const fadeOut = chapter.to >= 1 ? 1 : Math.min(1, Math.max(0, (chapter.to + ramp - progress) / ramp));
  return Math.min(fadeIn, fadeOut);
}

function CinematicHero({ config, reducedMotion }: { config: CinematicSiteConfig; reducedMotion: boolean }) {
  const { hero } = config;
  const trackRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chapterRefs = useRef<Array<HTMLDivElement | null>>([]);
  const framesRef = useRef<Map<number, HTMLImageElement>>(new Map());
  const loadingRef = useRef<Set<number>>(new Set());
  const currentFrameRef = useRef<number>(hero.firstFrame);
  // Shrinks if the sequence turns out to be shorter than frameCount, so
  // scrubbing spans the frames that actually exist instead of stalling on
  // repeated misses.
  const lastFrameRef = useRef<number>(hero.firstFrame + hero.frameCount - 1);

  useEffect(() => {
    const frames = framesRef.current;
    const loading = loadingRef.current;

    const frameUrl = (frame: number) =>
      `${hero.directory}/${hero.filePrefix}${String(frame).padStart(hero.framePadding, "0")}.${hero.fileExtension}`;

    const drawFrame = (frame: number) => {
      const canvas = canvasRef.current;
      const image = frames.get(frame);
      if (!canvas || !image || !image.complete || !image.naturalWidth) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, hero.maxDevicePixelRatio);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Cover-style fit around the configured focal point.
      const narrow = width < hero.narrowViewportBreakpoint;
      const focal = narrow ? hero.focalPoint.narrow : hero.focalPoint.wide;
      const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
      const drawWidth = image.naturalWidth * scale;
      const drawHeight = image.naturalHeight * scale;
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(image, (width - drawWidth) * focal.x, (height - drawHeight) * focal.y, drawWidth, drawHeight);
    };

    const loadFrame = (frame: number, onLoad?: () => void) => {
      if (frame < hero.firstFrame || frame > lastFrameRef.current) return;
      if (frames.has(frame) || loading.has(frame)) return;
      if (loading.size >= hero.loadConcurrency) return;
      loading.add(frame);
      const image = new Image();
      image.decoding = "async";
      image.onload = () => {
        loading.delete(frame);
        frames.set(frame, image);
        // Bound the decoded cache: evict whatever is farthest from the
        // frame currently on screen rather than retaining the sequence.
        while (frames.size > hero.maxCachedFrames) {
          let farthest = -1;
          let farthestDistance = -1;
          for (const key of frames.keys()) {
            const distance = Math.abs(key - currentFrameRef.current);
            if (distance > farthestDistance) { farthestDistance = distance; farthest = key; }
          }
          if (farthest < 0) break;
          frames.delete(farthest);
        }
        onLoad?.();
      };
      image.onerror = () => {
        loading.delete(frame);
        if (frame > hero.firstFrame && frame <= lastFrameRef.current) lastFrameRef.current = frame - 1;
      };
      image.src = frameUrl(frame);
    };

    const drawNearest = (targetFrame: number) => {
      if (frames.has(targetFrame)) { drawFrame(targetFrame); return; }
      let nearest: number | undefined;
      let nearestDistance = Infinity;
      for (const key of frames.keys()) {
        const distance = Math.abs(key - targetFrame);
        if (distance < nearestDistance) { nearestDistance = distance; nearest = key; }
      }
      if (nearest !== undefined) drawFrame(nearest);
    };

    loadFrame(hero.firstFrame, () => drawFrame(hero.firstFrame));
    // A handful of spread keyframes so scrubbing anywhere shows something
    // close by while the neighbouring frames stream in.
    for (let step = 1; step <= 6; step += 1) {
      loadFrame(Math.round(hero.firstFrame + (step / 6) * (hero.frameCount - 1)));
    }

    let frameRequest = 0;

    const update = () => {
      frameRequest = 0;
      const track = trackRef.current;
      if (!track) return;
      const progress = reducedMotion ? 0 : trackProgress(track);
      const lastFrame = lastFrameRef.current;
      const targetFrame = Math.round(hero.firstFrame + progress * Math.max(0, lastFrame - hero.firstFrame));
      currentFrameRef.current = targetFrame;

      drawNearest(targetFrame);
      // Bias loading slightly ahead of the playhead.
      for (let offset = -2; offset <= 4; offset += 1) {
        const frame = targetFrame + offset;
        loadFrame(frame, () => { if (currentFrameRef.current === frame) drawFrame(frame); });
      }

      chapterRefs.current.forEach((element, index) => {
        const chapter = hero.chapters[index];
        if (!element || !chapter) return;
        const opacity = reducedMotion ? 1 : chapterOpacity(progress, chapter);
        const visible = opacity > 0.02;
        element.style.opacity = String(opacity);
        element.dataset.visible = visible ? "true" : "false";
        element.setAttribute("aria-hidden", visible ? "false" : "true");
      });
    };

    const schedule = () => {
      if (frameRequest) return;
      frameRequest = requestAnimationFrame(update);
    };

    if (!reducedMotion) window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    schedule();

    return () => {
      if (frameRequest) cancelAnimationFrame(frameRequest);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [hero, reducedMotion]);

  // The opening chapter carries the page's h1; later chapters are h2s so the
  // heading outline stays valid however they fade in and out.
  const chapterBody = (chapter: SiteHeroChapter, index: number) => (
    <>
      <p className="eyebrow">{chapter.eyebrow}</p>
      {index === 0 ? <h1>{chapter.heading}</h1> : <h2>{chapter.heading}</h2>}
      <p className="muted">{chapter.body}</p>
      {(chapter.primaryCta || chapter.secondaryCta) && (
        <p className="hero-chapter__actions">
          {chapter.primaryCta && <a className="btn" href={chapter.primaryCta.href}>{chapter.primaryCta.label}</a>}
          {chapter.secondaryCta && (
            <a className="btn btn-secondary" href={chapter.secondaryCta.href}>{chapter.secondaryCta.label}</a>
          )}
        </p>
      )}
    </>
  );

  // Reduced motion: static poster frame, every chapter's copy visible in
  // normal flow, no scrubbing and no pinned track.
  if (reducedMotion) {
    return (
      <section className="hero-static" aria-label={`${siteConfig.businessName} introduction`}>
        <img className="hero-static__poster" src={hero.poster} alt="" />
        <div className="hero-static__chapters">
          {hero.chapters.map((chapter, index) => (
            <div key={chapter.id} className="hero-chapter" data-align={chapter.align} data-visible="true">
              {chapterBody(chapter, index)}
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section
      ref={trackRef}
      className="hero-track"
      aria-label={`${siteConfig.businessName} introduction`}
      style={{ height: `${hero.scrollHeightVh}vh` }}
    >
      <div className="hero-sticky">
        <canvas ref={canvasRef} className="hero-canvas" aria-hidden="true" />
        <div className="hero-scrim" aria-hidden="true" />
        {hero.chapters.map((chapter, index) => (
          <div
            key={chapter.id}
            ref={(element) => { chapterRefs.current[index] = element; }}
            className="hero-chapter"
            data-align={chapter.align}
            data-visible={index === 0 ? "true" : "false"}
            style={{ opacity: index === 0 ? 1 : 0 }}
          >
            {chapterBody(chapter, index)}
            {chapter.showScrollCue && <p className="hero-scroll-cue" aria-hidden="true">Scroll to discover</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

/** `1:1` / `4 / 5` config values become a CSS aspect-ratio value. */
function cssAspectRatio(value: string | undefined): string {
  const parts = (value ?? "1:1").split(/[:/]/).map((part) => part.trim());
  const [width, height] = parts;
  if (parts.length !== 2 || !Number(width) || !Number(height)) return "1 / 1";
  return `${Number(width)} / ${Number(height)}`;
}

/**
 * Product images resolve strictly to `productsDirectory/<filename>`; a
 * filename with a path separator or `..` is rejected rather than fetched.
 */
function productImageSrc(productsDirectory: string, item: SiteProductItem): string | null {
  const filename = item.image?.trim();
  if (!filename || filename.includes("/") || filename.includes("\\") || filename.includes("..")) return null;
  return `${productsDirectory}/${filename}`;
}

function ProductsRail({ config, reducedMotion }: { config: CinematicSiteConfig; reducedMotion: boolean }) {
  const { productsSection, assets } = config;
  const trackRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reducedMotion) return;
    let frameRequest = 0;

    const update = () => {
      frameRequest = 0;
      const track = trackRef.current;
      const rail = railRef.current;
      if (!track || !rail) return;
      const progress = trackProgress(track);
      // Measured travel: the rail's own content width beyond the viewport.
      const travel = Math.max(0, rail.scrollWidth - window.innerWidth);
      rail.style.transform = `translate3d(${-(progress * travel).toFixed(2)}px, 0, 0)`;
    };

    const schedule = () => {
      if (frameRequest) return;
      frameRequest = requestAnimationFrame(update);
    };

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    schedule();

    return () => {
      if (frameRequest) cancelAnimationFrame(frameRequest);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [reducedMotion]);

  const aspectRatio = cssAspectRatio(productsSection.imageAspectRatio);

  const cards = (
    <>
      <div className="products-intro">
        <p className="eyebrow">{productsSection.eyebrow}</p>
        <h2>{productsSection.heading}</h2>
        <p className="muted">{productsSection.body}</p>
      </div>
      {productsSection.items.map((item) => {
        const src = productImageSrc(assets.productsDirectory, item);
        return (
          <article className="product-card" key={`${item.category}-${item.name}`}>
            {src && (
              <div className="product-card__media" style={{ aspectRatio }}>
                <img src={src} alt={item.alt ?? item.name} loading="lazy" decoding="async" />
              </div>
            )}
            <p className="eyebrow">{item.category}</p>
            <h3>{item.name}</h3>
            <p className="muted">{item.description}</p>
          </article>
        );
      })}
    </>
  );

  // Reduced motion: the same square image cards as a vertical list.
  if (reducedMotion) {
    return (
      <section id={productsSection.id} className="products-list" aria-label={productsSection.heading}>
        {cards}
      </section>
    );
  }

  return (
    <section
      id={productsSection.id}
      ref={trackRef}
      className="rail-track"
      aria-label={productsSection.heading}
      style={{ height: `${productsSection.scrollHeightVh}vh` }}
    >
      <div className="rail-sticky">
        <div ref={railRef} className="products-rail">
          {cards}
        </div>
      </div>
    </section>
  );
}
