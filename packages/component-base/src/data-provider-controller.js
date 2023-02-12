import { Cache } from './data-provider-controller/cache.js';
import { getFlatIndexByPath, getFlatIndexInfo } from './data-provider-controller/helpers.js';

export class DataProviderController extends EventTarget {
  constructor(host, { size, pageSize, isExpanded, dataProvider, dataProviderParams }) {
    super();
    this.host = host;
    this.size = size;
    this.pageSize = pageSize;
    this.isExpanded = isExpanded;
    this.dataProvider = dataProvider;
    this.dataProviderParams = dataProviderParams;
    this.rootCache = new Cache(undefined, undefined, pageSize, size, this.isExpanded);
  }

  get effectiveSize() {
    return this.rootCache.effectiveSize;
  }

  get isLoading() {
    return this.rootCache.isLoading;
  }

  setSize(size) {
    this.size = size;
    this.rootCache.setSize(size);
  }

  setPageSize(pageSize) {
    this.pageSize = pageSize;
    this.clearCache();
  }

  setDataProvider(dataProvider) {
    this.dataProvider = dataProvider;
    this.clearCache();
  }

  recalculateEffectiveSize() {
    this.rootCache.recalculateEffectiveSize();
  }

  clearCache() {
    this.rootCache = new Cache(undefined, undefined, this.pageSize, this.size, this.isExpanded);
  }

  getFlatIndexInfo(flatIndex) {
    return getFlatIndexInfo(this.rootCache, flatIndex);
  }

  getFlatIndexByPath(path) {
    return getFlatIndexByPath(this.rootCache, path);
  }

  ensureFlatIndexLoaded(flatIndex) {
    const { cache, page, item } = this.getFlatIndexInfo(flatIndex);

    if (!item) {
      this.#loadCachePage(cache, page);
    }
  }

  ensureFlatIndexChildrenLoaded(flatIndex) {
    const { cache, item, index } = this.getFlatIndexInfo(flatIndex);

    if (item && this.isExpanded(item)) {
      let subCache = cache.getSubCache(index);
      if (!subCache) {
        subCache = cache.createSubCache(index);
      }

      if (!subCache.isPageLoaded(0)) {
        this.#loadCachePage(subCache, 0);
      }
    }
  }

  ensureFirstPageLoaded() {
    if (!this.rootCache.isPageLoaded(0)) {
      this.#loadCachePage(this.rootCache, 0);
    }
  }

  #loadCachePage(cache, page) {
    if (!this.dataProvider || cache.pendingRequests.has(page)) {
      return;
    }

    const params = {
      page,
      pageSize: this.pageSize,
      parentItem: cache.parentItem,
      ...this.dataProviderParams(),
    };

    const callback = (items, size) => {
      if (size !== undefined) {
        cache.setSize(size);
      } else if (params.parentItem) {
        cache.setSize(items.length);
      }

      cache.setPage(page, items);

      this.dispatchEvent(new CustomEvent('page-received'));

      cache.pendingRequests.delete(page);

      this.dispatchEvent(new CustomEvent('page-loaded'));
    };

    cache.pendingRequests.set(page, callback);

    this.dispatchEvent(new CustomEvent('page-requested'));

    this.dataProvider(params, callback);
  }
}
