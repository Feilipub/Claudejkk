/**
 * Quest-only items: evidence, letters and keepsakes picked up during the
 * story. All weigh next to nothing, sell for nothing and never stack.
 */
import type { ItemDef } from '../items.ts';

export const QUEST_ITEMS: ItemDef[] = [
  {
    id: 'wagon_manifest',
    name: 'Scorched Freight Manifest',
    category: 'document',
    weight: 0.05,
    price: 0,
    stack: 1,
    icon: 'letter',
    description: 'A Meridian & Western requisition for "remount stock", half-burned, initialled E.V. Found in the wreck of a freight wagon near the Brannigan ranch.',
  },
  {
    id: 'remount_bill',
    name: 'Fort Rourke Bill of Sale',
    category: 'document',
    weight: 0.05,
    price: 0,
    stack: 1,
    icon: 'letter',
    description: 'Lt. Abernathy\'s copy of a bill of sale from the "Hadley Remount Company": eleven head, several carrying the Brannigan Rocking B.',
  },
  {
    id: 'pruitt_notebook',
    name: 'Pruitt\'s Field Notebook',
    category: 'quest',
    weight: 0.2,
    price: 0,
    stack: 1,
    icon: 'book',
    description: 'Thaddeus Pruitt\'s original 1885 field notes for the Calder Extension survey. Bearings, chainages and station stakes along the northern route, every page dated and signed.',
  },
  {
    id: 'silas_affidavit',
    name: 'Silas Brannigan\'s Affidavit',
    category: 'document',
    weight: 0.05,
    price: 0,
    stack: 1,
    icon: 'letter',
    description: 'A sworn statement in Silas\'s cramped hand, witnessed by Minerva Lindqvist, describing what he saw at Coyle\'s Roost on the night of March 30th.',
  },
  {
    id: 'agency_ledger',
    name: 'Agency Trader\'s Tally Book',
    category: 'document',
    weight: 0.1,
    price: 0,
    stack: 1,
    icon: 'book',
    description: 'Royce Kimbrough\'s private tally of Sayen stock "condemned" and resold. The numbers do not match the ones he sent to the Indian Office.',
  },
  {
    id: 'okafor_letter',
    name: 'Dr. Okafor\'s Instructions',
    category: 'document',
    weight: 0.02,
    price: 0,
    stack: 1,
    icon: 'letter',
    description: 'A folded page of very firm handwriting: how to dress a crushed leg, and what to do if the man in question argues.',
  },
  {
    id: 'cup_entry',
    name: 'Larkspur Cup Entry Ticket',
    category: 'quest',
    weight: 0.01,
    price: 0,
    stack: 1,
    icon: 'letter',
    description: 'Paper ticket, number 14. Josiah Oakes has written "no pushing" across the back.',
  },
];
