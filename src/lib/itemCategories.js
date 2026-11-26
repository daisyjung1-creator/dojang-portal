// Item categories, in the order items are listed everywhere (invoice item
// picker, Gear / Shop, Invoice Settings). sort_order follows the category.
export const ITEM_CATEGORIES = ['Tuition / Plans', 'Testing', 'Gear', 'Uniform & Apparel', 'Events & Camps', 'Competition & Travel', 'Other fees'];
export const categorySort = (c) => {
  const i = ITEM_CATEGORIES.indexOf(c);
  return (i < 0 ? ITEM_CATEGORIES.length : i + 1) * 10;
};
