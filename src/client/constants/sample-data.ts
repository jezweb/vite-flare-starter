/**
 * Sample data for FeaturesPage previews
 * Uses realistic Australian business data for professional appearance
 */

// Sample Contacts
export const sampleContacts = [
  {
    id: '1',
    firstName: 'Sarah',
    lastName: 'Mitchell',
    email: 'sarah.mitchell@apexindustries.com.au',
    phone: '+61 412 345 678',
    jobTitle: 'Marketing Director',
    company: 'Apex Industries',
    status: 'active' as const,
    tags: ['VIP', 'Enterprise'],
  },
  {
    id: '2',
    firstName: 'James',
    lastName: 'Chen',
    email: 'james.chen@techstart.io',
    phone: '+61 423 456 789',
    jobTitle: 'Chief Technology Officer',
    company: 'TechStart',
    status: 'active' as const,
    tags: ['Technical', 'Decision Maker'],
  },
  {
    id: '3',
    firstName: 'Emma',
    lastName: 'Thompson',
    email: 'emma.t@globalretail.com.au',
    phone: '+61 434 567 890',
    jobTitle: 'Procurement Manager',
    company: 'Global Retail',
    status: 'active' as const,
    tags: ['Procurement'],
  },
  {
    id: '4',
    firstName: 'Michael',
    lastName: 'Nguyen',
    email: 'michael.nguyen@meridianhealth.org',
    phone: '+61 445 678 901',
    jobTitle: 'Operations Director',
    company: 'Meridian Health',
    status: 'inactive' as const,
    tags: ['Healthcare'],
  },
  {
    id: '5',
    firstName: 'Rachel',
    lastName: 'Williams',
    email: 'r.williams@summitfinancial.com.au',
    phone: '+61 456 789 012',
    jobTitle: 'Senior Account Manager',
    company: 'Summit Financial',
    status: 'active' as const,
    tags: ['Finance', 'Enterprise'],
  },
]

// Sample Companies
export const sampleCompanies = [
  {
    id: '1',
    name: 'Apex Industries',
    industry: 'Manufacturing',
    status: 'active' as const,
    contactCount: 12,
    website: 'apexindustries.com.au',
  },
  {
    id: '2',
    name: 'TechStart',
    industry: 'Technology',
    status: 'active' as const,
    contactCount: 8,
    website: 'techstart.io',
  },
  {
    id: '3',
    name: 'Global Retail',
    industry: 'Retail',
    status: 'active' as const,
    contactCount: 15,
    website: 'globalretail.com.au',
  },
  {
    id: '4',
    name: 'Meridian Health',
    industry: 'Healthcare',
    status: 'active' as const,
    contactCount: 6,
    website: 'meridianhealth.org',
  },
  {
    id: '5',
    name: 'Summit Financial',
    industry: 'Financial Services',
    status: 'active' as const,
    contactCount: 9,
    website: 'summitfinancial.com.au',
  },
]

// Sample Deals (organized by pipeline stage)
export const sampleDeals = {
  lead: [
    {
      id: '1',
      title: 'Enterprise Platform License',
      value: 45000,
      company: 'Apex Industries',
      probability: 20,
    },
    {
      id: '2',
      title: 'Annual SaaS Subscription',
      value: 12000,
      company: 'TechStart',
      probability: 30,
    },
  ],
  qualified: [
    {
      id: '3',
      title: 'Cloud Migration Project',
      value: 78000,
      company: 'Global Retail',
      probability: 50,
    },
    {
      id: '4',
      title: 'Security Audit & Implementation',
      value: 25000,
      company: 'Meridian Health',
      probability: 45,
    },
  ],
  proposal: [
    {
      id: '5',
      title: 'Custom Integration Suite',
      value: 32000,
      company: 'TechStart',
      probability: 65,
    },
  ],
  negotiation: [
    {
      id: '6',
      title: 'Multi-Year Enterprise Contract',
      value: 156000,
      company: 'Summit Financial',
      probability: 80,
    },
  ],
}

// Sample Cases
export const sampleCases = [
  {
    id: '1',
    subject: 'SSO Integration not authenticating',
    status: 'in_progress' as const,
    priority: 'high' as const,
    type: 'support' as const,
    dueDate: '2025-12-02',
    contact: 'James Chen',
  },
  {
    id: '2',
    subject: 'Feature request: Bulk export to Excel',
    status: 'open' as const,
    priority: 'medium' as const,
    type: 'feature_request' as const,
    dueDate: '2025-12-15',
    contact: 'Sarah Mitchell',
  },
  {
    id: '3',
    subject: 'API rate limiting causing timeouts',
    status: 'in_progress' as const,
    priority: 'urgent' as const,
    type: 'bug' as const,
    dueDate: '2025-11-30',
    contact: 'Michael Nguyen',
  },
  {
    id: '4',
    subject: 'Training session for new team members',
    status: 'new' as const,
    priority: 'low' as const,
    type: 'inquiry' as const,
    dueDate: '2025-12-20',
    contact: 'Emma Thompson',
  },
  {
    id: '5',
    subject: 'Invoice discrepancy for Q3 billing',
    status: 'resolved' as const,
    priority: 'medium' as const,
    type: 'inquiry' as const,
    dueDate: '2025-11-28',
    contact: 'Rachel Williams',
  },
]

// Sample Enquiries
export const sampleEnquiries = [
  {
    id: '1',
    status: 'new' as const,
    name: 'John Smith',
    email: 'john.smith@newprospect.com.au',
    message: 'Interested in your enterprise package for our team of 50+ users. Can we schedule a demo?',
    receivedAt: '2h ago',
    source: 'contact' as const,
  },
  {
    id: '2',
    status: 'viewed' as const,
    name: 'Lisa Anderson',
    email: 'lisa.a@startupco.io',
    message: 'Looking for a CRM solution that integrates with our existing tools. What APIs do you offer?',
    receivedAt: '1d ago',
    source: 'quote' as const,
  },
  {
    id: '3',
    status: 'replied' as const,
    name: 'David Park',
    email: 'd.park@enterprisecorp.com',
    message: 'Our team needs custom reporting features. Is this something you can accommodate?',
    receivedAt: '2d ago',
    source: 'contact' as const,
  },
  {
    id: '4',
    status: 'new' as const,
    name: 'Maria Garcia',
    email: 'mgarcia@mediumsizedbiz.com.au',
    message: 'We are comparing CRM solutions. What makes yours different from Salesforce?',
    receivedAt: '3h ago',
    source: 'quote' as const,
  },
]

// Sample Doc Spaces
export const sampleSpaces = [
  {
    id: '1',
    name: 'User Guide',
    visibility: 'public' as const,
    docCount: 24,
    description: 'Getting started and how-to guides',
  },
  {
    id: '2',
    name: 'API Documentation',
    visibility: 'authenticated' as const,
    docCount: 18,
    description: 'REST API reference and examples',
  },
  {
    id: '3',
    name: 'Internal Wiki',
    visibility: 'private' as const,
    docCount: 42,
    description: 'Team processes and knowledge base',
  },
]

// Sample Documents (with hierarchy)
export const sampleDocuments = [
  { id: '1', title: 'Getting Started', parent: null, icon: 'file' as const },
  { id: '2', title: 'Managing Contacts', parent: null, icon: 'file' as const },
  { id: '3', title: 'Import & Export', parent: '2', icon: 'file' as const },
  { id: '4', title: 'Contact Fields Reference', parent: '2', icon: 'file' as const },
  { id: '5', title: 'Deal Pipeline Guide', parent: null, icon: 'file' as const },
  { id: '6', title: 'Reporting & Analytics', parent: null, icon: 'file' as const },
]

// Sample Notes (for threaded display)
export const sampleNotes = [
  {
    id: '1',
    author: 'Sarah Mitchell',
    initials: 'SM',
    content: `<p>Had a great call with the team today. Key points discussed:</p>
<ul>
<li><strong>Timeline:</strong> Q1 2026 launch target</li>
<li>Budget approved for Phase 1</li>
<li>Need to follow up on technical requirements</li>
</ul>`,
    timestamp: '2 hours ago',
    replies: 1,
  },
  {
    id: '2',
    author: 'James Chen',
    initials: 'JC',
    content: `<p>Technical review complete. Integration looks straightforward - their API is well documented. <a href="#">See notes</a></p>`,
    timestamp: '45 minutes ago',
    replies: 0,
  },
]
