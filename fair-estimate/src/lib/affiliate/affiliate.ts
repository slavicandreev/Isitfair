import { DIYAssessment, AffiliateLink, AffiliatePartner, QuoteExtraction, ServiceType } from '@/types';

const AMAZON_AFFILIATE_TAG = process.env.AMAZON_AFFILIATE_TAG || 'fairestimate-20';
const AUTOZONE_AFFILIATE_ID = process.env.AUTOZONE_AFFILIATE_ID || '';
const HOME_DEPOT_AFFILIATE_ID = process.env.HOME_DEPOT_AFFILIATE_ID || '';

function buildAmazonUrl(searchQuery: string): string {
  const encodedQuery = encodeURIComponent(searchQuery);
  return `https://www.amazon.com/s?k=${encodedQuery}&tag=${AMAZON_AFFILIATE_TAG}`;
}

function buildAutoZoneUrl(searchQuery: string): string {
  const encodedQuery = encodeURIComponent(searchQuery);
  return `https://www.autozone.com/searchresult?searchtext=${encodedQuery}`;
}

function buildHomeDepotUrl(searchQuery: string): string {
  const encodedQuery = encodeURIComponent(searchQuery);
  return `https://www.homedepot.com/s/${encodedQuery}`;
}

function buildSearchQuery(
  item: DIYAssessment,
  extraction: QuoteExtraction,
  serviceType: ServiceType
): string {
  if (serviceType === 'auto_repair' && extraction.vehicle_info) {
    const { year, make, model } = extraction.vehicle_info;
    const partName = item.item_description;
    return [year, make, model, partName].filter(Boolean).join(' ');
  } else if (extraction.property_info) {
    const equipmentInfo = extraction.property_info.equipment_specs || '';
    const partName = item.item_description;
    return [equipmentInfo, partName].filter(Boolean).join(' ');
  }
  return item.item_description;
}

function generateAutoLinks(searchQuery: string, diyPartCost: number | null): AffiliateLink[] {
  const links: AffiliateLink[] = [
    {
      partner: 'amazon' as AffiliatePartner,
      display_name: 'Amazon',
      url: buildAmazonUrl(searchQuery),
      estimated_price: diyPartCost,
      in_store_pickup: false,
    },
    {
      partner: 'autozone' as AffiliatePartner,
      display_name: 'AutoZone',
      url: buildAutoZoneUrl(searchQuery),
      estimated_price: diyPartCost ? diyPartCost * 1.1 : null,
      in_store_pickup: true,
    },
  ];
  return links;
}

function generateHomeLinks(searchQuery: string, diyPartCost: number | null): AffiliateLink[] {
  const links: AffiliateLink[] = [
    {
      partner: 'amazon' as AffiliatePartner,
      display_name: 'Amazon',
      url: buildAmazonUrl(searchQuery),
      estimated_price: diyPartCost,
      in_store_pickup: false,
    },
    {
      partner: 'homedepot' as AffiliatePartner,
      display_name: 'Home Depot',
      url: buildHomeDepotUrl(searchQuery),
      estimated_price: diyPartCost ? diyPartCost * 1.05 : null,
      in_store_pickup: true,
    },
  ];
  return links;
}

export async function generateAffiliateLinks(
  diyAssessments: DIYAssessment[],
  extraction: QuoteExtraction
): Promise<AffiliateLink[]> {
  const allLinks: AffiliateLink[] = [];

  for (const assessment of diyAssessments) {
    if (!assessment.diy_flag) continue;

    const searchQuery = buildSearchQuery(assessment, extraction, extraction.service_type);

    const links = extraction.service_type === 'auto_repair'
      ? generateAutoLinks(searchQuery, assessment.diy_part_cost)
      : generateHomeLinks(searchQuery, assessment.diy_part_cost);

    // Attach links to the assessment
    assessment.affiliate_links = links;
    allLinks.push(...links);
  }

  return allLinks;
}
