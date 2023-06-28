/**
 * @license
 * Copyright (c) 2016 - 2023 Vaadin Ltd.
 * This program is available under Apache License Version 2.0, available at https://vaadin.com/license/
 */
import '@vaadin/checkbox/src/vaadin-checkbox.js';
import { addListener } from '@vaadin/component-base/src/gestures.js';
import { GridColumn } from './vaadin-grid-column.js';

/**
 * `<vaadin-grid-selection-column>` is a helper element for the `<vaadin-grid>`
 * that provides default renderers and functionality for item selection.
 *
 * #### Example:
 * ```html
 * <vaadin-grid items="[[items]]">
 *  <vaadin-grid-selection-column frozen auto-select></vaadin-grid-selection-column>
 *
 *  <vaadin-grid-column>
 *    ...
 * ```
 *
 * By default the selection column displays `<vaadin-checkbox>` elements in the
 * column cells. The checkboxes in the body rows toggle selection of the corresponding row items.
 *
 * When the grid data is provided as an array of [`items`](#/elements/vaadin-grid#property-items),
 * the column header gets an additional checkbox that can be used for toggling
 * selection for all the items at once.
 *
 * __The default content can also be overridden__
 *
 * @fires {CustomEvent} select-all-changed - Fired when the `selectAll` property changes.
 */
class GridSelectionColumn extends GridColumn {
  static get is() {
    return 'vaadin-grid-selection-column';
  }

  static get properties() {
    return {
      /**
       * Width of the cells for this column.
       */
      width: {
        type: String,
        value: '58px',
      },

      /**
       * Flex grow ratio for the cell widths. When set to 0, cell width is fixed.
       * @attr {number} flex-grow
       * @type {number}
       */
      flexGrow: {
        type: Number,
        value: 0,
      },

      /**
       * When true, all the items are selected.
       * @attr {boolean} select-all
       * @type {boolean}
       */
      selectAll: {
        type: Boolean,
        value: false,
        notify: true,
      },

      /**
       * When true, the active gets automatically selected.
       * @attr {boolean} auto-select
       * @type {boolean}
       */
      autoSelect: {
        type: Boolean,
        value: false,
      },

      /** @private */
      __indeterminate: Boolean,

      /**
       * The previous state of activeItem. When activeItem turns to `null`,
       * previousActiveItem will have an Object with just unselected activeItem
       * @private
       */
      __previousActiveItem: Object,

      /** @private */
      __selectAllHidden: Boolean,
    };
  }

  static get observers() {
    return [
      '__onSelectAllChanged(selectAll)',
      '_onHeaderRendererOrBindingChanged(_headerRenderer, _headerCell, path, header, selectAll, __indeterminate, __selectAllHidden)',
    ];
  }

  constructor() {
    super();

    this.__boundOnActiveItemChanged = this.__onActiveItemChanged.bind(this);
    this.__boundOnDataProviderChanged = this.__onDataProviderChanged.bind(this);
    this.__boundOnSelectedItemsChanged = this.__onSelectedItemsChanged.bind(this);
    this.__onSelectionColumnCellTrack = this.__onSelectionColumnCellTrack.bind(this);
  }

  /** @protected */
  disconnectedCallback() {
    this._grid.removeEventListener('active-item-changed', this.__boundOnActiveItemChanged);
    this._grid.removeEventListener('data-provider-changed', this.__boundOnDataProviderChanged);
    this._grid.removeEventListener('filter-changed', this.__boundOnSelectedItemsChanged);
    this._grid.removeEventListener('selected-items-changed', this.__boundOnSelectedItemsChanged);

    super.disconnectedCallback();
  }

  /** @protected */
  connectedCallback() {
    super.connectedCallback();
    if (this._grid) {
      this._grid.addEventListener('active-item-changed', this.__boundOnActiveItemChanged);
      this._grid.addEventListener('data-provider-changed', this.__boundOnDataProviderChanged);
      this._grid.addEventListener('filter-changed', this.__boundOnSelectedItemsChanged);
      this._grid.addEventListener('selected-items-changed', this.__boundOnSelectedItemsChanged);
    }
  }

  /**
   * Renders the Select All checkbox to the header cell.
   *
   * @override
   */
  _defaultHeaderRenderer(root, _column) {
    let checkbox = root.firstElementChild;
    if (!checkbox) {
      checkbox = document.createElement('vaadin-checkbox');
      checkbox.setAttribute('aria-label', 'Select All');
      checkbox.classList.add('vaadin-grid-select-all-checkbox');
      checkbox.addEventListener('checked-changed', this.__onSelectAllCheckedChanged.bind(this));
      root.appendChild(checkbox);
    }

    const checked = this.__isChecked(this.selectAll, this.__indeterminate);
    checkbox.__rendererChecked = checked;
    checkbox.checked = checked;
    checkbox.hidden = this.__selectAllHidden;
    checkbox.indeterminate = this.__indeterminate;
  }

  /** @private */
  __lassoAutoScroller() {
    if (this.__lassoDragStartIndex !== undefined) {
      // Get the row being hovered over
      const renderedRows = this._grid._getRenderedRows();
      let rowHeight = 30;
      const hoveredRow = renderedRows.find((row) => {
        const rowRect = row.getBoundingClientRect();
        rowHeight = rowRect.height;
        return this.__lassoCurrentY >= rowRect.top && this.__lassoCurrentY <= rowRect.bottom;
      });

      // Get the index of the row being hovered over or the first/last
      // visible row if hovering outside the grid
      let hoveredIndex = hoveredRow ? hoveredRow.index : undefined;
      const gridRect = this._grid.getBoundingClientRect();
      if (this.__lassoCurrentY < gridRect.top) {
        hoveredIndex = this._grid._firstVisibleIndex;
      } else if (this.__lassoCurrentY > gridRect.bottom) {
        hoveredIndex = this._grid._lastVisibleIndex;
      }

      if (hoveredIndex !== undefined) {
        // Select all items between the start and the current row
        renderedRows.forEach((row) => {
          if (
            (hoveredIndex > this.__lassoDragStartIndex &&
              row.index >= this.__lassoDragStartIndex &&
              row.index <= hoveredIndex) ||
            (hoveredIndex < this.__lassoDragStartIndex &&
              row.index <= this.__lassoDragStartIndex &&
              row.index >= hoveredIndex)
          ) {
            if (this.__lassoSelect) {
              this._grid.selectItem(row._item);
            } else {
              this._grid.deselectItem(row._item);
            }
          }
        });
      }

      // Auto scroll the grid
      this._grid.$.table.scrollTop += (this.__lassoDy || 0) / (rowHeight / 2);

      // Schedule the next auto scroll
      setTimeout(() => this.__lassoAutoScroller(), 100);
    }
  }

  /** @private */
  __onSelectionColumnCellTrack(event) {
    if (!this._grid.selectRowsByDragging) {
      return;
    }
    this.__lassoDy = event.detail.dy;
    this.__lassoCurrentY = event.detail.y;
    if (event.detail.state === 'start') {
      this._grid.setAttribute('disable-text-selection', true);
      this.__lassoWasEnabled = true;
      const renderedRows = this._grid._getRenderedRows();
      // Get the row where the drag started
      const lassoStartRow = renderedRows.find((row) => row.contains(event.currentTarget.assignedSlot));
      // Whether to select or deselect the items on drag
      this.__lassoSelect = !this._grid._isSelected(lassoStartRow._item);
      // Store the index of the row where the drag started
      this.__lassoDragStartIndex = lassoStartRow.index;
      // Start the auto scroller
      this.__lassoAutoScroller();
    } else if (event.detail.state === 'end') {
      this.__lassoDragStartIndex = undefined;
      this._grid.removeAttribute('disable-text-selection');
    }
  }

  /**
   * Renders the Select Row checkbox to the body cell.
   *
   * @override
   */
  _defaultRenderer(root, _column, { item, selected }) {
    let checkbox = root.firstElementChild;
    if (!checkbox) {
      checkbox = document.createElement('vaadin-checkbox');
      checkbox.setAttribute('aria-label', 'Select Row');
      checkbox.addEventListener('checked-changed', this.__onSelectRowCheckedChanged.bind(this));
      addListener(root, 'track', this.__onSelectionColumnCellTrack);
      root.appendChild(checkbox);
    }

    checkbox.__item = item;
    checkbox.__rendererChecked = selected;
    checkbox.checked = selected;
  }

  /** @private */
  __onSelectAllChanged(selectAll) {
    if (selectAll === undefined || !this._grid) {
      return;
    }

    if (!this.__selectAllInitialized) {
      // The initial value for selectAll property was applied, avoid clearing pre-selected items
      this.__selectAllInitialized = true;
      return;
    }

    if (this._selectAllChangeLock) {
      return;
    }

    if (selectAll && this.__hasArrayDataProvider()) {
      this.__withFilteredItemsArray((items) => {
        this._grid.selectedItems = items;
      });
    } else {
      this._grid.selectedItems = [];
    }
  }

  /**
   * Return true if array `a` contains all the items in `b`
   * We need this when sorting or to preserve selection after filtering.
   * @private
   */
  __arrayContains(a, b) {
    return Array.isArray(a) && Array.isArray(b) && b.every((i) => a.includes(i));
  }

  /**
   * Enables or disables the Select All mode once the Select All checkbox is switched.
   * The listener handles only user-fired events.
   *
   * @private
   */
  __onSelectAllCheckedChanged(e) {
    // Skip if the state is changed by the renderer.
    if (e.target.checked === e.target.__rendererChecked) {
      return;
    }

    this.selectAll = this.__indeterminate || e.target.checked;
  }

  /**
   * Selects or deselects the row once the Select Row checkbox is switched.
   * The listener handles only user-fired events.
   *
   * @private
   */
  __onSelectRowCheckedChanged(e) {
    // Skip if the state is changed by the renderer.
    if (e.target.checked === e.target.__rendererChecked) {
      return;
    }

    if (e.target.checked) {
      this._grid.selectItem(e.target.__item);
    } else {
      this._grid.deselectItem(e.target.__item);
    }
  }

  /**
   * IOS needs indeterminate + checked at the same time
   * @private
   */
  __isChecked(selectAll, indeterminate) {
    return indeterminate || selectAll;
  }

  /** @private */
  __onActiveItemChanged(e) {
    const activeItem = e.detail.value;
    if (this.autoSelect && !this.__lassoWasEnabled) {
      const item = activeItem || this.__previousActiveItem;
      if (item) {
        this._grid._toggleItem(item);
      }
    }
    this.__lassoWasEnabled = false;
    this.__previousActiveItem = activeItem;
  }

  /** @private */
  __hasArrayDataProvider() {
    return Array.isArray(this._grid.items) && !!this._grid.dataProvider;
  }

  /** @private */
  __onSelectedItemsChanged() {
    this._selectAllChangeLock = true;
    if (this.__hasArrayDataProvider()) {
      this.__withFilteredItemsArray((items) => {
        if (!this._grid.selectedItems.length) {
          this.selectAll = false;
          this.__indeterminate = false;
        } else if (this.__arrayContains(this._grid.selectedItems, items)) {
          this.selectAll = true;
          this.__indeterminate = false;
        } else {
          this.selectAll = false;
          this.__indeterminate = true;
        }
      });
    }
    this._selectAllChangeLock = false;
  }

  /** @private */
  __onDataProviderChanged() {
    this.__selectAllHidden = !Array.isArray(this._grid.items);
  }

  /**
   * Assuming the grid uses an items array data provider, fetches all the filtered items
   * from the data provider and invokes the callback with the resulting array.
   *
   * @private
   */
  __withFilteredItemsArray(callback) {
    const params = {
      page: 0,
      pageSize: Infinity,
      sortOrders: [],
      filters: this._grid._mapFilters(),
    };
    this._grid.dataProvider(params, (items) => callback(items));
  }
}

customElements.define(GridSelectionColumn.is, GridSelectionColumn);

export { GridSelectionColumn };
