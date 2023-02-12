/**
 * @private
 */
export class Cache {
  /**
   * An array of cached items.
   *
   * @type {object[]}
   */
  items = [];

  /**
   * A map where the key is a requested page and the value is a callback
   * that will be called with data once the request is complete.
   *
   * @type {Map<number, Function>}
   */
  pendingRequests = new Map();

  /**
   * A map where the key is the index of an item in the `items` array
   * and the value is a sub-cache associated with that item.
   *
   * Note, it's intentionally defined as an object instead of a Map
   * to ensure that Object.entries() returns an array with keys sorted
   * in alphabetical order, rather than the order they were added.
   *
   * @type {Record<number, Cache>}
   */
  #subCacheByIndex = {};

  /**
   * @param {Cache | undefined} parentCache
   * @param {number | undefined} parentCacheIndex
   * @param {number} pageSize
   * @param {number | undefined} size
   * @param {Function} isExpanded
   */
  constructor(parentCache, parentCacheIndex, pageSize, size, isExpanded) {
    this.parentCache = parentCache;
    this.parentCacheIndex = parentCacheIndex;
    this.pageSize = pageSize;
    this.size = size || 0;
    this.effectiveSize = size || 0;
    this.isExpanded = isExpanded;
  }

  /**
   * An item in the parent cache that the current cache is associated with.
   *
   * @return {object | undefined}
   */
  get parentItem() {
    return this.parentCache && this.parentCache.items[this.parentCacheIndex];
  }

  /**
   * Whether the cache or any of its descendant caches have pending requests.
   *
   * @return {boolean}
   */
  get isLoading() {
    if (this.pendingRequests.size > 0) {
      return true;
    }

    return Object.values(this.#subCacheByIndex).some((subCache) => subCache.isLoading);
  }

  /**
   * An array of sub-caches sorted in the same order as their associated items
   * appear in the `items` array.
   *
   * @return {Array<[number, Cache]>}
   */
  get subCaches() {
    return Object.entries(this.#subCacheByIndex).map(([index, subCache]) => {
      return [parseInt(index), subCache];
    });
  }

  /**
   * Recalculates the effective size for the cache and its descendant caches recursively.
   */
  recalculateEffectiveSize() {
    this.effectiveSize =
      !this.parentItem || this.isExpanded(this.parentItem)
        ? this.size +
          Object.values(this.#subCacheByIndex).reduce((total, subCache) => {
            subCache.recalculateEffectiveSize();
            return total + subCache.effectiveSize;
          }, 0)
        : 0;
  }

  /**
   * Updates the cache's size and recalculates the effective size,
   * propagating the result to the ancestor caches.
   *
   * @param {number} size
   */
  setSize(size) {
    const delta = size - this.size;
    this.size = size;

    // eslint-disable-next-line @typescript-eslint/no-this-alias, consistent-this
    let cache = this;
    while (cache) {
      cache.effectiveSize += delta;
      cache = cache.parentCache;
    }
  }

  /**
   * Adds an array of items corresponding to the given page
   * to the `items` array.
   *
   * @param {number} page
   * @param {object[]} items
   */
  setPage(page, items) {
    const startIndex = page * this.pageSize;

    items.forEach((item, i) => {
      this.items[startIndex + i] = item;
    });
  }

  /**
   * Returns whether the given page has been loaded in the cache.
   *
   * @param {number} page
   * @return {boolean}
   */
  isPageLoaded(page) {
    return this.items[page * this.pageSize] !== undefined;
  }

  /**
   * Retrieves the sub-cache associated with the item at the given index
   * in the `items` array.
   *
   * @param {number} index
   * @return {Cache | undefined}
   */
  getSubCache(index) {
    return this.#subCacheByIndex[index];
  }

  /**
   * Removes the sub-cache associated with the item at the given index
   * in the `items` array.
   *
   * @param {number} index
   */
  removeSubCache(index) {
    delete this.#subCacheByIndex[index];
  }

  /**
   * Creates and associates a sub-cache for the item at the given index
   * in the `items` array.
   *
   * @param {number} index
   * @return {Cache}
   */
  createSubCache(index) {
    const subCache = new Cache(this, index, this.pageSize, 0, this.isExpanded);
    this.#subCacheByIndex[index] = subCache;
    return subCache;
  }

  /**
   * Retrieves the flattened index corresponding to the given index
   * of an item in the `items` array.
   *
   * @param {number} index
   * @return {number}
   */
  getFlatIndex(index) {
    const clampedIndex = Math.max(0, Math.min(this.size - 1, index));

    return this.subCaches.reduce((prev, [index, subCache]) => {
      return clampedIndex > index ? prev + subCache.effectiveSize : prev;
    }, clampedIndex);
  }
}
