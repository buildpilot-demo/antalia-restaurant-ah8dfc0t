import { useCallback, useEffect, useRef } from "react";
import { siteConfig } from "../site.config";
import { isBackendConfigured, submitInquiryToBackend, type InquiryValues } from "../lib/convex";
import { EnquiryForm } from "./EnquiryForm";

// Shared across both the cinematic and plain site variants (see
// src/types/site-config.ts) — enquirySection, businessName, and contact all
// live on the common base of SiteConfig, so this needs no variant branch.
export function EnquirySection() {
  const { enquirySection, businessName, contact } = siteConfig;
  const sectionRef = useRef<HTMLDivElement>(null);

  // Sends the enquiry to the shared multi-tenant Convex backend. Without
  // configured env vars, or if the mutation fails, the form reports
  // enquirySection.disconnectedMessage instead of a fabricated success.
  const handleSubmit = useCallback(async (values: InquiryValues) => {
    if (!isBackendConfigured) throw new Error(enquirySection.disconnectedMessage);
    try {
      await submitInquiryToBackend(values);
    } catch (error) {
      console.error("Enquiry submission failed", error);
      throw new Error(enquirySection.disconnectedMessage);
    }
  }, [enquirySection.disconnectedMessage]);

  useEffect(() => {
    const element = sectionRef.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      element?.classList.add("is-visible");
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) element.classList.add("is-visible"); },
      { threshold: 0.2 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <section id={enquirySection.id} ref={sectionRef} className="enquiry-section">
      <div className="enquiry-grid">
        <div className="enquiry-intro">
          <p className="eyebrow">{enquirySection.eyebrow}</p>
          <h2>{enquirySection.heading}</h2>
          <p className="muted">{enquirySection.body}</p>
          {contact.address && <p className="muted">{contact.address}</p>}
          {contact.hours && <p className="muted">{contact.hours}</p>}
        </div>
        <div className="enquiry-form">
          <EnquiryForm onSubmit={handleSubmit} />
        </div>
      </div>
      <footer className="site-footer">
        <div className="site-footer__grid">
          <div><strong>{businessName}</strong></div>
          <div>
            {contact.phone && <p className="muted">{contact.phone}</p>}
            {contact.email && <p className="muted"><a href={`mailto:${contact.email}`}>{contact.email}</a></p>}
          </div>
        </div>
      </footer>
    </section>
  );
}
