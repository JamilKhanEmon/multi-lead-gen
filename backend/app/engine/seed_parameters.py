"""
Seed Data Script for 135 Parameters, Initial Business Types, and 31 Agency Services.
"""
import asyncio
from typing import List, Dict
from sqlalchemy import select
from app.db.session import AsyncSessionLocal, engine
from app.models import Base, Parameter, BusinessType, BusinessTypeParameter, Service, ServiceRule

# 135 Parameters Specification
PARAMETERS_SEED = [
    # Category A: Google Maps / Business Profile (1-10)
    (1, "Business listing presence", "Cat A: Google Maps", "OBSERVABLE", 1.0, "Presence of verified or unverified business profile on Maps/directories."),
    (2, "Rating score", "Cat A: Google Maps", "OBSERVABLE", 0.9, "Average public review rating score."),
    (3, "Review count", "Cat A: Google Maps", "OBSERVABLE", 0.8, "Total volume of customer reviews."),
    (4, "Review recency", "Cat A: Google Maps", "OBSERVABLE", 0.9, "Recency of the most recent customer review."),
    (5, "Negative review patterns", "Cat A: Google Maps", "OBSERVABLE", 1.1, "Clustered customer complaints regarding service or staff."),
    (6, "Owner response rate", "Cat A: Google Maps", "OBSERVABLE", 1.0, "Percentage of customer reviews answered by business owner."),
    (7, "Photo freshness", "Cat A: Google Maps", "OBSERVABLE", 0.7, "Recency of owner-uploaded storefront or project photos."),
    (8, "Business information completeness", "Cat A: Google Maps", "OBSERVABLE", 0.8, "Completeness of address, hours, category, and attributes."),
    (9, "Opening hours accuracy", "Cat A: Google Maps", "OBSERVABLE", 0.7, "Accuracy and updates of operating hours."),
    (10, "Website/phone availability", "Cat A: Google Maps", "OBSERVABLE", 1.0, "Presence of valid working contact phone or site link on profile."),

    # Category B: Social Media (11-23)
    (11, "Facebook presence", "Cat B: Social Media", "OBSERVABLE", 0.8, "Active public Facebook page presence."),
    (12, "Instagram presence", "Cat B: Social Media", "OBSERVABLE", 0.8, "Active public Instagram profile presence."),
    (13, "LinkedIn presence", "Cat B: Social Media", "OBSERVABLE", 0.8, "Active public LinkedIn company page."),
    (14, "YouTube presence", "Cat B: Social Media", "OBSERVABLE", 0.6, "Active public YouTube channel."),
    (15, "TikTok presence", "Cat B: Social Media", "OBSERVABLE", 0.5, "Active public TikTok account."),
    (16, "Last post date", "Cat B: Social Media", "OBSERVABLE", 0.9, "Timestamp of newest published social media post."),
    (17, "Posting frequency", "Cat B: Social Media", "OBSERVABLE", 0.7, "Regularity of content publication over the last 90 days."),
    (18, "Engagement rate", "Cat B: Social Media", "OBSERVABLE", 0.7, "Public likes, shares, and comments relative to follower count."),
    (19, "Follower-to-engagement ratio", "Cat B: Social Media", "OBSERVABLE", 0.6, "Ratio indicating genuine audience interaction."),
    (20, "Content quality", "Cat B: Social Media", "OBSERVABLE", 0.8, "Visual and narrative quality of published social assets."),
    (21, "Customer comment response", "Cat B: Social Media", "OBSERVABLE", 1.0, "Business responsiveness to public customer questions in comments."),
    (22, "Page inactivity", "Cat B: Social Media", "OBSERVABLE", 0.9, "Prolonged period (>90 days) without social posts."),
    (23, "Missing contact/WhatsApp", "Cat B: Social Media", "OBSERVABLE", 1.0, "Absence of direct WhatsApp link or phone on social pages."),

    # Category C: Marketing & Advertising (24-33)
    (24, "Active advertising", "Cat C: Marketing & Ads", "OBSERVABLE", 0.9, "Publicly active ads in Meta Ad Library or Google Ad Transparency."),
    (25, "Ad frequency", "Cat C: Marketing & Ads", "OBSERVABLE", 0.7, "Volume and duration of running advertising campaigns."),
    (26, "Ad creative quality", "Cat C: Marketing & Ads", "OBSERVABLE", 0.8, "Visual design and copywriting quality of active ads."),
    (27, "CTA quality", "Cat C: Marketing & Ads", "OBSERVABLE", 0.9, "Clarity of Call-To-Action in advertisement creatives."),
    (28, "Offer clarity", "Cat C: Marketing & Ads", "OBSERVABLE", 0.8, "Clarity of value proposition or promotional offer."),
    (29, "Landing page quality", "Cat C: Marketing & Ads", "OBSERVABLE", 1.1, "User experience and performance of ad landing pages."),
    (30, "Ad-to-contact flow", "Cat C: Marketing & Ads", "INFERABLE", 1.1, "Friction between clicking an ad and reaching a lead contact form."),
    (31, "Campaign activity", "Cat C: Marketing & Ads", "OBSERVABLE", 0.7, "Recent updates to campaign ad creatives."),
    (32, "Marketing consistency", "Cat C: Marketing & Ads", "INFERABLE", 0.8, "Alignment between ad promises and website/social branding."),
    (33, "Conversion signals", "Cat C: Marketing & Ads", "INFERABLE", 1.0, "Presence of conversion tracking signals or lead capture flow."),

    # Category D: Website (34-51)
    (34, "Website availability", "Cat D: Website", "OBSERVABLE", 1.2, "HTTP 200 response and availability of corporate website."),
    (35, "Domain quality", "Cat D: Website", "OBSERVABLE", 0.8, "Ownership of custom domain vs free subdomain."),
    (36, "Design/UI quality", "Cat D: Website", "OBSERVABLE", 1.0, "Modern visual aesthetics, visual balance, and clean typography."),
    (37, "Mobile responsiveness", "Cat D: Website", "OBSERVABLE", 1.2, "Viewport optimization and layout scaling on mobile devices."),
    (38, "Page speed", "Cat D: Website", "OBSERVABLE", 1.0, "Loading performance and core web vitals signals."),
    (39, "SEO basics", "Cat D: Website", "OBSERVABLE", 0.7, "Presence of title tags, meta descriptions, and header hierarchy."),
    (40, "Service information", "Cat D: Website", "OBSERVABLE", 1.0, "Clarity and detail of offered business services."),
    (41, "Contact information", "Cat D: Website", "OBSERVABLE", 1.1, "Prominent display of phone number, address, and email."),
    (42, "Contact form", "Cat D: Website", "OBSERVABLE", 1.1, "Working interactive lead inquiry contact form."),
    (43, "WhatsApp integration", "Cat D: Website", "OBSERVABLE", 1.1, "Click-to-chat WhatsApp widget or direct messaging integration."),
    (44, "Online booking", "Cat D: Website", "OBSERVABLE", 1.2, "Interactive online appointment scheduling or reservation tool."),
    (45, "Online ordering", "Cat D: Website", "OBSERVABLE", 1.1, "E-commerce or direct product/service ordering flow."),
    (46, "Online payment", "Cat D: Website", "OBSERVABLE", 1.0, "Integrated digital payment gateway for transactions."),
    (47, "Portfolio/project pages", "Cat D: Website", "OBSERVABLE", 1.1, "Case studies, project photo galleries, or past work showcase."),
    (48, "Testimonials", "Cat D: Website", "OBSERVABLE", 0.8, "Client reviews, video testimonials, or social proof on website."),
    (49, "Pricing/quotation system", "Cat D: Website", "OBSERVABLE", 0.9, "Instant price calculator or transparent quotation request form."),
    (50, "Broken links", "Cat D: Website", "OBSERVABLE", 0.8, "Presence of HTTP 404 dead links on public site."),
    (51, "Outdated content", "Cat D: Website", "OBSERVABLE", 0.9, "Outdated copyright years, old blog posts, or obsolete announcements."),

    # Category E: CX & Reputation (52-60)
    (52, "Repeated complaints", "Cat E: CX & Reputation", "OBSERVABLE", 1.2, "Multiple independent public reviews citing the exact same issue."),
    (53, "Negative reviews", "Cat E: CX & Reputation", "OBSERVABLE", 1.0, "Volume of 1-star or 2-star reviews across platforms."),
    (54, "Response-time complaints", "Cat E: CX & Reputation", "OBSERVABLE", 1.1, "Customer complaints regarding unreturned calls or slow responses."),
    (55, "Service-quality complaints", "Cat E: CX & Reputation", "OBSERVABLE", 1.1, "Public feedback alleging unsatisfactory service execution."),
    (56, "Delivery complaints", "Cat E: CX & Reputation", "OBSERVABLE", 1.0, "Complaints regarding delayed project delivery or fulfillment."),
    (57, "Support complaints", "Cat E: CX & Reputation", "OBSERVABLE", 1.0, "Complaints regarding poor post-sale customer support."),
    (58, "Pricing complaints", "Cat E: CX & Reputation", "OBSERVABLE", 0.8, "Customer complaints regarding unexpected fees or high costs."),
    (59, "Unanswered reviews/comments", "Cat E: CX & Reputation", "OBSERVABLE", 1.0, "High volume of negative public reviews left without response."),
    (60, "Customer satisfaction signals", "Cat E: CX & Reputation", "INFERABLE", 0.9, "Overall sentiment trend across public channels."),

    # Category F: Technology Gap (61-73)
    (61, "Mobile app", "Cat F: Technology Gap", "INFERABLE", 0.7, "Presence of native iOS/Android mobile application."),
    (62, "Customer portal", "Cat F: Technology Gap", "INFERABLE", 0.9, "Self-service web portal for client account management."),
    (63, "CRM", "Cat F: Technology Gap", "INTERNAL", 1.0, "Internal customer relationship management system usage."),
    (64, "ERP", "Cat F: Technology Gap", "INTERNAL", 0.9, "Internal enterprise resource planning system usage."),
    (65, "POS", "Cat F: Technology Gap", "INFERABLE", 0.8, "Point of Sale digital transaction management."),
    (66, "E-commerce", "Cat F: Technology Gap", "OBSERVABLE", 1.0, "Digital storefront capability."),
    (67, "Booking system", "Cat F: Technology Gap", "OBSERVABLE", 1.1, "Automated reservation management software."),
    (68, "Online payment", "Cat F: Technology Gap", "OBSERVABLE", 1.0, "Digital checkout integration."),
    (69, "API integrations", "Cat F: Technology Gap", "INFERABLE", 0.8, "Interoperability between public forms and backend software."),
    (70, "Internal software", "Cat F: Technology Gap", "INTERNAL", 0.8, "Custom internal business applications."),
    (71, "Cloud systems", "Cat F: Technology Gap", "INFERABLE", 0.7, "Cloud hosting and infrastructure signals."),
    (72, "Data management systems", "Cat F: Technology Gap", "INTERNAL", 0.8, "Structured data storage and reporting systems."),
    (73, "Technology modernization need", "Cat F: Technology Gap", "INFERABLE", 1.1, "Overall evidence suggesting reliance on legacy manual methods."),

    # Category G: AI Opportunity (74-80)
    (74, "AI chatbot", "Cat G: AI Opportunity", "OBSERVABLE", 0.8, "Presence of conversational AI assistant on website."),
    (75, "AI customer support", "Cat G: AI Opportunity", "INFERABLE", 0.8, "Automated AI ticket resolution or support system."),
    (76, "AI sales assistant", "Cat G: AI Opportunity", "INFERABLE", 0.8, "AI-driven lead qualification or product recommendation agent."),
    (77, "AI voice agent", "Cat G: AI Opportunity", "INFERABLE", 0.7, "Automated voice inquiry handling system."),
    (78, "Document processing", "Cat G: AI Opportunity", "INFERABLE", 0.7, "Automated processing of customer documents or quotes."),
    (79, "OCR", "Cat G: AI Opportunity", "INFERABLE", 0.6, "Optical character recognition for invoices or paper records."),
    (80, "Recommendation system", "Cat G: AI Opportunity", "INFERABLE", 0.7, "Personalized product/service recommendation engine."),

    # Category H: Automation Opportunity (81-90)
    (81, "Manual lead collection", "Cat H: Automation Opportunity", "INFERABLE", 1.0, "Evidence of manual unautomated lead capture (e.g. raw email link)."),
    (82, "Manual lead follow-up", "Cat H: Automation Opportunity", "INFERABLE", 1.1, "Absence of automated instant email/SMS confirmation after inquiry."),
    (83, "Manual booking", "Cat H: Automation Opportunity", "INFERABLE", 1.1, "Booking requests processed via manual phone call or delayed email."),
    (84, "Manual customer support", "Cat H: Automation Opportunity", "INFERABLE", 1.0, "Customer support handled entirely via manual human response."),
    (85, "Manual data entry", "Cat H: Automation Opportunity", "INTERNAL", 0.9, "Manual transfer of web inquiries into spreadsheets or accounting."),
    (86, "Manual reporting", "Cat H: Automation Opportunity", "INTERNAL", 0.7, "Manual aggregation of business reports."),
    (87, "Manual invoice/order processing", "Cat H: Automation Opportunity", "INFERABLE", 0.9, "Invoicing generated manually upon request."),
    (88, "Manual CRM updates", "Cat H: Automation Opportunity", "INTERNAL", 0.8, "Manual entry of customer pipeline updates."),
    (89, "Manual notifications", "Cat H: Automation Opportunity", "INFERABLE", 0.8, "Manual dispatch of appointment reminders."),
    (90, "Manual social-media management", "Cat H: Automation Opportunity", "INFERABLE", 0.7, "Absence of scheduling or automated cross-posting."),

    # Category I: Business Activity & Growth Signals (91-101)
    (91, "New projects", "Cat I: Growth Signals", "OBSERVABLE", 0.8, "Public announcements or portfolio updates regarding new projects."),
    (92, "New products", "Cat I: Growth Signals", "OBSERVABLE", 0.8, "Recent introduction of new products."),
    (93, "New services", "Cat I: Growth Signals", "OBSERVABLE", 0.8, "Expansion into new service lines."),
    (94, "New branches", "Cat I: Growth Signals", "OBSERVABLE", 0.9, "Opening of new physical branch locations."),
    (95, "Expansion", "Cat I: Growth Signals", "OBSERVABLE", 0.9, "Company expansion into new markets or regions."),
    (96, "Hiring activity", "Cat I: Growth Signals", "OBSERVABLE", 1.0, "Active job postings indicating business growth."),
    (97, "New partnerships", "Cat I: Growth Signals", "OBSERVABLE", 0.7, "Strategic corporate partnerships announced."),
    (98, "New market entry", "Cat I: Growth Signals", "OBSERVABLE", 0.8, "Entry into new vertical or geographic markets."),
    (99, "Recent launches", "Cat I: Growth Signals", "OBSERVABLE", 0.8, "Recent product, service, or campaign launches."),
    (100, "Business inactivity", "Cat I: Growth Signals", "OBSERVABLE", 1.0, "Absence of public updates or announcements for >12 months."),
    (101, "Project updates", "Cat I: Growth Signals", "OBSERVABLE", 0.8, "Regular progress updates on ongoing client projects."),

    # Category J: IT & Cybersecurity (102-108)
    (102, "HTTPS/SSL", "Cat J: IT & Cybersecurity", "OBSERVABLE", 1.1, "Valid SSL certificate and HTTPS enforcement."),
    (103, "Security warnings", "Cat J: IT & Cybersecurity", "OBSERVABLE", 1.2, "Browser security warnings or mixed content errors."),
    (104, "Professional business email", "Cat J: IT & Cybersecurity", "OBSERVABLE", 0.9, "Use of domain-branded email vs free Gmail/Yahoo addresses."),
    (105, "Domain/email consistency", "Cat J: IT & Cybersecurity", "OBSERVABLE", 0.8, "Match between website domain name and contact email domain."),
    (106, "Public security incidents", "Cat J: IT & Cybersecurity", "OBSERVABLE", 1.0, "Publicly reported data breaches or security notices."),
    (107, "Visible outdated technology", "Cat J: IT & Cybersecurity", "OBSERVABLE", 0.9, "Public exposure of end-of-life CMS versions or server headers."),
    (108, "Public privacy/security information", "Cat J: IT & Cybersecurity", "OBSERVABLE", 0.7, "Presence of public Privacy Policy and Terms pages."),

    # Category K: Domain & Hosting (109-116)
    (109, "Own domain", "Cat K: Domain & Hosting", "OBSERVABLE", 0.9, "Ownership of standalone primary brand domain."),
    (110, "Domain-brand match", "Cat K: Domain & Hosting", "OBSERVABLE", 0.8, "Exact match between registered domain name and corporate brand."),
    (111, "SSL certificate", "Cat K: Domain & Hosting", "OBSERVABLE", 1.0, "Presence and validity of SSL encryption certificate."),
    (112, "Website availability", "Cat K: Domain & Hosting", "OBSERVABLE", 1.1, "Uptime and response latency of web host."),
    (113, "Domain age", "Cat K: Domain & Hosting", "OBSERVABLE", 0.7, "Registration age of corporate domain name."),
    (114, "Professional email", "Cat K: Domain & Hosting", "OBSERVABLE", 0.9, "Presence of corporate domain MX mail records."),
    (115, "Subdomain/free-domain usage", "Cat K: Domain & Hosting", "OBSERVABLE", 0.9, "Reliance on free wix/wordpress/blogspot subdomains."),
    (116, "Hosting availability signals", "Cat K: Domain & Hosting", "OBSERVABLE", 0.8, "Hosting provider performance and location signals."),

    # Category L: Visual Analysis (117-125)
    (117, "Website UI/UX", "Cat L: Visual Analysis", "OBSERVABLE", 1.0, "Multimodal evaluation of website layout and visual design aesthetics."),
    (118, "Social-media creatives", "Cat L: Visual Analysis", "OBSERVABLE", 0.8, "Visual quality of graphics and images posted on social media."),
    (119, "Advertisement creatives", "Cat L: Visual Analysis", "OBSERVABLE", 0.9, "Visual appeal and design standards of active advertisement banners."),
    (120, "Branding consistency", "Cat L: Visual Analysis", "OBSERVABLE", 0.8, "Visual brand logo and color scheme consistency across platforms."),
    (121, "Product presentation", "Cat L: Visual Analysis", "OBSERVABLE", 0.9, "High-resolution photography and visual presentation of products."),
    (122, "Project presentation", "Cat L: Visual Analysis", "OBSERVABLE", 1.0, "Professional photography showcasing completed client projects."),
    (123, "Google Maps photos", "Cat L: Visual Analysis", "OBSERVABLE", 0.8, "Visual quality of owner photos on Google Business Profile."),
    (124, "Store/showroom appearance", "Cat L: Visual Analysis", "OBSERVABLE", 0.8, "Visual appearance of physical retail storefront or showroom."),
    (125, "Construction/project-site visuals", "Cat L: Visual Analysis", "OBSERVABLE", 0.9, "High-quality site photos demonstrating active construction work."),

    # Category M: Lead Intent Signals (126-135)
    (126, "Company actively hiring", "Cat M: Lead Intent", "OBSERVABLE", 1.1, "Active job openings indicating team expansion."),
    (127, "Company launching something", "Cat M: Lead Intent", "OBSERVABLE", 1.0, "Public announcements of upcoming product/service launches."),
    (128, "Company expanding", "Cat M: Lead Intent", "OBSERVABLE", 1.0, "Public signals of geographic or operational expansion."),
    (129, "High customer inquiry volume", "Cat M: Lead Intent", "INFERABLE", 1.1, "High volume of public questions in comments/reviews."),
    (130, "Increasing reviews", "Cat M: Lead Intent", "OBSERVABLE", 0.9, "Accelerating rate of new Google/social reviews."),
    (131, "New location", "Cat M: Lead Intent", "OBSERVABLE", 1.0, "Announcements of new office, clinic, or branch openings."),
    (132, "New project", "Cat M: Lead Intent", "OBSERVABLE", 0.9, "Securing of major new client contract or construction project."),
    (133, "New product/service", "Cat M: Lead Intent", "OBSERVABLE", 0.9, "Launch of new commercial offering."),
    (134, "Recent funding/investment", "Cat M: Lead Intent", "OBSERVABLE", 1.0, "Public records of capital investment or funding round."),
    (135, "Technology-related job openings", "Cat M: Lead Intent", "OBSERVABLE", 1.2, "Job postings for IT, software, marketing, or operations roles."),
]

BUSINESS_TYPES_SEED = [
    ("construction", "Construction & Contracting", "Builders, general contractors, engineering firms, renovation specialists."),
    ("real_estate", "Real Estate & Property", "Property developers, real estate agencies, property management companies."),
    ("clinic", "Clinics & Healthcare", "Private medical clinics, dental practices, diagnostic centers, specialized care."),
    ("restaurant", "Restaurants & Hospitality", "Dining establishments, cafes, bakeries, food service, catering, hotels."),
    ("ecommerce", "E-Commerce & Retail", "Online retailers, consumer brands, physical stores with digital presence."),
    ("professional_services", "Professional Services", "Law firms, accounting practices, consulting agencies, financial advisory."),
    ("software", "Software & IT Services", "SaaS companies, IT agencies, managed service providers, tech startups."),
    ("other", "General Business", "Other commercial business operations."),
]

SERVICES_SEED = [
    ("Website Development", "website-development", "Digital Presence", "Custom high-performance web development."),
    ("Website Modernization", "website-modernization", "Digital Presence", "Redesign and performance modernization of legacy websites."),
    ("Custom Software", "custom-software", "Software Solutions", "Tailored web applications and internal business software."),
    ("Web Applications", "web-applications", "Software Solutions", "SaaS platforms, client portals, and interactive web apps."),
    ("Mobile App Development", "mobile-app-development", "Software Solutions", "Native iOS and Android mobile apps."),
    ("AI Chatbot", "ai-chatbot", "AI Solutions", "Conversational AI assistants for 24/7 web engagement."),
    ("AI Customer Support", "ai-customer-support", "AI Solutions", "Automated customer support ticket resolution."),
    ("AI Sales Assistant", "ai-sales-assistant", "AI Solutions", "AI-driven lead qualification and recommendation assistant."),
    ("AI Voice Agent", "ai-voice-agent", "AI Solutions", "Automated phone inquiry handling and appointment booking."),
    ("WhatsApp Automation", "whatsapp-automation", "Automation", "Automated WhatsApp lead capture, notifications, and customer chat."),
    ("Social Automation", "social-automation", "Automation", "Automated social media publishing and comment responses."),
    ("CRM", "crm", "Software Solutions", "Implementation and integration of Customer Relationship Management software."),
    ("ERP-related Systems", "erp-systems", "Software Solutions", "Business resource management software and inventory systems."),
    ("Booking Systems", "booking-systems", "Software Solutions", "Automated online appointment scheduling and calendar management."),
    ("Ordering Systems", "ordering-systems", "Software Solutions", "Digital online product/food ordering platforms."),
    ("E-commerce", "e-commerce", "Digital Presence", "Online storefronts, product catalogs, and checkout systems."),
    ("Payment Integration", "payment-integration", "Software Solutions", "Integrated digital payment gateways (SSLCommerz, bKash, Stripe)."),
    ("Workflow Automation", "workflow-automation", "Automation", "Custom business workflow and data processing automation."),
    ("n8n Automation", "n8n-automation", "Automation", "Open-source workflow integration and pipeline automation."),
    ("AI Integration", "ai-integration", "AI Solutions", "Integration of LLMs, vision, and AI models into existing software."),
    ("RAG", "rag", "AI Solutions", "Retrieval-Augmented Generation knowledge systems for internal business data."),
    ("OCR", "ocr", "AI Solutions", "Optical Character Recognition for document digitizing."),
    ("Document Processing", "document-processing", "Automation", "Automated parsing and processing of PDFs, invoices, and contracts."),
    ("Predictive Analytics", "predictive-analytics", "AI Solutions", "Data science models for business forecasting and customer churn."),
    ("Recommendation Systems", "recommendation-systems", "AI Solutions", "Personalized product and service recommendation engines."),
    ("Computer Vision", "computer-vision", "AI Solutions", "Visual inspection and image analysis algorithms."),
    ("AI Search", "ai-search", "AI Solutions", "Semantic vector search engines for enterprise content."),
    ("Dashboards", "dashboards", "Software Solutions", "Interactive analytics and operational reporting dashboards."),
    ("API Integrations", "api-integrations", "Software Solutions", "Connecting disparate software tools via secure REST/GraphQL APIs."),
    ("Cloud/Infrastructure modernization", "cloud-modernization", "Infrastructure", "Migration to secure cloud infrastructure and DevOps pipelines."),
    ("Public-facing IT/Security improvement", "security-improvement", "Infrastructure", "Passive SSL, domain security, and professional email setup."),
]


async def seed_database():
    """Seeds parameters, business types, and services into PostgreSQL."""
    print("[*] Ensuring database tables are created...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("[+] Database tables verified.")

    async with AsyncSessionLocal() as session:
        print("[*] Seeding 135 Parameters...")
        for p_id, name, cat, det, wt, desc in PARAMETERS_SEED:
            stmt = select(Parameter).where(Parameter.id == p_id)
            res = await session.execute(stmt)
            param = res.scalar_one_or_none()
            if not param:
                param = Parameter(
                    id=p_id, name=name, category=cat, detection_type=det, default_weight=wt, description=desc
                )
                session.add(param)
            else:
                param.name = name
                param.category = cat
                param.detection_type = det
                param.default_weight = wt
                param.description = desc

        print("[*] Seeding Business Types...")
        for slug, dname, desc in BUSINESS_TYPES_SEED:
            stmt = select(BusinessType).where(BusinessType.slug == slug)
            res = await session.execute(stmt)
            bt = res.scalar_one_or_none()
            if not bt:
                bt = BusinessType(slug=slug, display_name=dname, description=desc)
                session.add(bt)

        print("[*] Seeding 31 Agency Services...")
        for name, slug, cat, desc in SERVICES_SEED:
            stmt = select(Service).where(Service.slug == slug)
            res = await session.execute(stmt)
            svc = res.scalar_one_or_none()
            if not svc:
                svc = Service(name=name, slug=slug, category=cat, description=desc, is_active=True)
                session.add(svc)

        await session.commit()
        print("[+] Seed completed successfully.")


if __name__ == "__main__":
    asyncio.run(seed_database())
