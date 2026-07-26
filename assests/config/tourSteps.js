/**
 * Tour step definitions for the Fish Farming Guide app.
 *
 * Each step is a simple card shown in the TourGuide overlay.
 * Steps appear center-screen by default; optional `position`
 * can be 'top', 'center', or 'bottom'.
 *
 * No TourAnchor wrappers needed — the tour uses a clean
 * modal overlay with tooltip cards.
 */

const tourSteps = {
  // -----------------------------------------------------------------------
  // Dashboard tour
  // -----------------------------------------------------------------------
  Dashboard: [
    {
      title: 'Add Your First Pond',
      description:
        'Start by creating a pond. Tap this button to define your pond dimensions, type, and stage (Nursery or Grow-out).',
      position: 'bottom',
    },
    {
      title: 'Farm Overview',
      description:
        'These cards show your total ponds, fingerling count, estimated biomass, and expenses at a glance.',
      position: 'center',
    },
    {
      title: 'Pond Details',
      description:
        'Each pond card shows its name, size, stage, stocked species, and any alerts. Tap the pencil icon to edit, or expand for capacity details.',
      position: 'center',
    },
    {
      title: 'Update Fish Size',
      description:
        'Tap the pencil icon next to a species to update its current size. The app will alert you when fish are ready to transfer or harvest.',
      position: 'center',
    },
    {
      title: 'Quick Actions',
      description:
        'Use these buttons to add fish, log mortality, harvest, check water quality, record expenses, feed, fertilize, or transfer fish between ponds.',
      position: 'top',
    },
    {
      title: 'Navigation Menu',
      description:
        'Tap the hamburger icon to open the side menu. From there you can navigate to any section: Stock, Feeding, Water, Budget, Marketplace, and more.',
      position: 'bottom',
    },
  ],

  // -----------------------------------------------------------------------
  // Add Pond tour
  // -----------------------------------------------------------------------
  AddPond: [
    {
      title: 'Pond Name',
      description:
        'Give your pond a descriptive name like "Nursery Pond 1" or "Grow-out A".',
      position: 'bottom',
    },
    {
      title: 'Pond Stage',
      description:
        'Choose Nursery for fingerlings (up to 6 inches) or Grown-out for fish being raised to market size.',
      position: 'bottom',
    },
    {
      title: 'Pond Dimensions',
      description:
        'Enter length, width, and depth in feet. The app calculates water volume and stocking capacity automatically.',
      position: 'bottom',
    },
    {
      title: 'Save Pond',
      description:
        'Once all details are filled, tap Save to create your pond. You can then stock it with fish.',
      position: 'top',
    },
  ],

  // -----------------------------------------------------------------------
  // Stock Management tour
  // -----------------------------------------------------------------------
  StockManagement: [
    {
      title: 'Stock Fish',
      description:
        'Tap here to add fish to a pond. Select the species, quantity, and initial size.',
      position: 'bottom',
    },
    {
      title: 'Transfer Fish',
      description:
        'Move fish between ponds — for example, from Nursery to Grow-out when they reach fingerling size.',
      position: 'bottom',
    },
    {
      title: 'Current Stock',
      description:
        'View all your stocked fish across ponds. Each entry shows species, quantity, current size, and status.',
      position: 'center',
    },
  ],

  // -----------------------------------------------------------------------
  // Marketplace tour
  // -----------------------------------------------------------------------
  Marketplace: [
    {
      title: 'Marketplace Listings',
      description:
        'Browse fish for sale from other farms, or list your own fish when customers demand a size you can supply.',
      position: 'center',
    },
    {
      title: 'Create a Listing',
      description:
        'Create a listing with species, weight, quantity, and price for any customer-requested harvest size.',
      position: 'bottom',
    },
  ],

  // -----------------------------------------------------------------------
  // Feeding Guide tour
  // -----------------------------------------------------------------------
  FeedGuide: [
    {
      title: 'Feeding Recommendations',
      description:
        'The app calculates daily feed amounts based on your fish species, size, and pond stage.',
      position: 'bottom',
    },
    {
      title: 'Log Feeding',
      description:
        'Record each feeding session to track consumption and costs over time.',
      position: 'bottom',
    },
  ],

  // -----------------------------------------------------------------------
  // Budget tour
  // -----------------------------------------------------------------------
  BudgetE: [
    {
      title: 'Add Expense',
      description:
        'Track all farm costs: feed, fertilizer, fingerlings, labor, equipment, and more.',
      position: 'bottom',
    },
    {
      title: 'Expense Summary',
      description:
        'View your spending breakdown by category and pond to manage your farm budget effectively.',
      position: 'center',
    },
  ],

  // -----------------------------------------------------------------------
  // Reports tour
  // -----------------------------------------------------------------------
  Reports: [
    {
      title: 'Farm Reports',
      description:
        'Review every farm activity in one timeline: stocking, feeding, harvest, expenses, disease, water checks, and marketplace events.',
      position: 'center',
    },
    {
      title: 'ROI Report',
      description:
        'Switch to ROI Report to see harvest profitability, allocated expenses, profit/loss, and ROI percentage by pond.',
      position: 'bottom',
    },
    {
      title: 'Filters and Timeframes',
      description:
        'Use timeframe chips, pond filters, and activity filters to narrow the report to exactly what you need.',
      position: 'bottom',
    },
  ],

  // -----------------------------------------------------------------------
  // Water Quality tour
  // -----------------------------------------------------------------------
  WaterQuality: [
    {
      title: 'Water Cycle Guide',
      description:
        'Use this page as a guide for water exchange, filtration, and aeration. Record pond readings from a pond card on the dashboard.',
      position: 'bottom',
    },
    {
      title: 'Water Alerts',
      description:
        'The app warns you when water parameters fall outside safe ranges for your fish species.',
      position: 'center',
    },
  ],
};

export default tourSteps;
