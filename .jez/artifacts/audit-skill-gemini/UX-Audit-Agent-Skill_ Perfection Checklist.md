# **UX Perfection Checklist: Component-Level Granularity**

Use this checklist to audit every individual element within the application.

## **1\. Buttons & Triggers**

* \[ \] **State Clarity:** Does the button have distinct hover, active, focus, and disabled states?  
* \[ \] **Intent Matching:** Does the button's color match the action's weight? (Primary vs. Ghost vs. Danger).  
* \[ \] **Micro-Copy:** Does the text start with a verb? (e.g., "Export CSV" instead of "Data").  
* \[ \] **Loading State:** Does the button show a spinner or "Sending..." text when clicked to prevent double-clicks?  
* \[ \] **Visual Hierarchy:** Is there only one primary "Call to Action" (CTA) per screen?

## **2\. Input Boxes & Forms**

* \[ \] **Persistent Labels:** Are labels visible even after the user starts typing? (Never use placeholders as labels).  
* \[ \] **Input Masks:** Are phone numbers, dates, and currency formatted automatically as the user types?  
* \[ \] **Inline Validation:** Does the error message appear *after* the user leaves the field, or *during* typing if it's a "strength" check?  
* \[ \] **Error Clarity:** Avoid "Invalid input." Use "Please enter a valid email address (e.g., name@domain.com)."  
* \[ \] **Defaulting:** Are common fields pre-filled? (e.g., Country based on IP, or most common selection).

## **3\. Navigation & Hierarchy**

* \[ \] **The "Where Am I?" Test:** Can a user look at the screen and immediately know which module and sub-section they are in? (Breadcrumbs/Active states).  
* \[ \] **Click Depth:** Can the primary user task be reached in 3 clicks or fewer from the dashboard?  
* \[ \] **Search Logic:** Does search handle typos? Does it show "No results found for \[Query\]" clearly?  
* \[ \] **Sticky Headers:** Does the navigation stay accessible on long pages, or hide/reveal intelligently?

## **4\. Visual Coherence**

* \[ \] **Icon Consistency:** Are all icons from the same family? (Don't mix sharp corners with rounded corners).  
* \[ \] **Empty States:** When there is no data, is there a helpful illustration and a CTA to "Get Started"?  
* \[ \] **Border Radii:** Are the corners of buttons, cards, and modals identical? (Consistent 4px, 8px, or 12px).  
* \[ \] **Contrast Ratio:** Does all text pass WCAG AA (4.5:1) for readability?

## **5\. Mobile & Touch**

* \[ \] **Tappable Surface:** Are links and buttons large enough to hit with a thumb without hitting neighbors?  
* \[ \] **Keyboard Optimization:** Does the "Number" keyboard pop up for numeric fields?  
* \[ \] **Swipe Gestures:** Are swiping actions (like "delete" on a list) discoverable or backed up by visible buttons?

## **6\. Performance & Feedback**

* \[ \] **Skeleton Screens:** Does the app use skeleton loaders instead of a blank white page while data fetches?  
* \[ \] **Success Toasts:** Does a non-intrusive "Success" message appear after a background task finishes?  
* \[ \] **Confirmation Modals:** Are they used *only* for high-stakes, irreversible actions?