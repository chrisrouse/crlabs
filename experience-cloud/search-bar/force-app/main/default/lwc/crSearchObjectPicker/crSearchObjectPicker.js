import { LightningElement, api, track } from "lwc";
import getSearchableObjects from "@salesforce/apex/SearchBarController.getSearchableObjects";

export default class CrSearchObjectPicker extends LightningElement {
    @api label;
    @api errors;

    @track _selected = [];
    @track _available = [];
    @track showEditor = false;
    @track filterText = "";
    @track editingPubliclyAvailable = true;
    @track editingCustomUrlEnabled = false;
    @track editingCustomUrl = "";
    @track _loadingObjects = true;
    @track _fetchError = false;

    _editingIndex = -1;
    _editingApiName = "";
    _editingLabel = "";
    _dragSrcApiName = null;

    @api
    set value(v) {
        try {
            this._selected = v && v !== "[]" ? JSON.parse(v) : [];
        } catch (e) {
            this._selected = [];
        }
    }
    get value() {
        return JSON.stringify(this._selected);
    }

    connectedCallback() {
        this._loadAvailableObjects();
    }

    _loadAvailableObjects() {
        this._loadingObjects = true;
        this._fetchError = false;
        getSearchableObjects()
            .then((result) => {
                this._available = [...result].sort((a, b) => a.label.localeCompare(b.label));
            })
            .catch((e) => {
                // eslint-disable-next-line no-console
                console.error("crSearchObjectPicker: failed to load objects", e);
                this._fetchError = true;
                this._available = [];
            })
            .finally(() => {
                this._loadingObjects = false;
            });
    }

    // ── Getters ─────────────────────────────────────────────────────────────

    get selectedObjects() {
        return this._selected.map((obj, index) => ({ ...obj, index }));
    }

    get filteredObjects() {
        const selectedApis = new Set(this._selected.map((o) => o.apiName));
        const filter = this.filterText.toLowerCase();
        return this._available
            .filter((o) => !filter || o.label.toLowerCase().includes(filter))
            .map((o) => ({
                ...o,
                itemClass:
                    o.apiName === this._editingApiName
                        ? "dropdown-item selected"
                        : selectedApis.has(o.apiName) && o.apiName !== this._editingApiName
                          ? "dropdown-item disabled"
                          : "dropdown-item"
            }));
    }

    // ── List handlers ────────────────────────────────────────────────────────

    handleAdd() {
        const selectedApis = new Set(this._selected.map((o) => o.apiName));
        const next = this._available.find((o) => !selectedApis.has(o.apiName));
        if (!next) return;
        this._selected = [...this._selected, { apiName: next.apiName, label: next.label, publiclyAvailable: true }];
        this._dispatch();
    }

    handleRemove(event) {
        const index = parseInt(event.currentTarget.dataset.index, 10);
        this._selected = this._selected.filter((_, i) => i !== index);
        if (this._editingIndex === index) {
            this.showEditor = false;
        }
        this._dispatch();
    }

    handleEditObject(event) {
        const index = parseInt(event.currentTarget.dataset.index, 10);
        const obj = this._selected[index];
        this._editingIndex = index;
        this._editingApiName = obj.apiName;
        this._editingLabel = obj.label;
        this.editingPubliclyAvailable = obj.publiclyAvailable;
        this.editingCustomUrl = obj.customUrl || "";
        this.editingCustomUrlEnabled = !!obj.customUrl;
        this.filterText = "";
        this.showEditor = true;
    }

    // ── Editor handlers ──────────────────────────────────────────────────────

    handleFilterInput(event) {
        this.filterText = event.target.value;
    }

    handleSelectObject(event) {
        this._editingApiName = event.currentTarget.dataset.api;
        this._editingLabel = event.currentTarget.dataset.label;
        this.filterText = "";
    }

    handlePublicToggle(event) {
        this.editingPubliclyAvailable = event.target.checked;
    }

    handleCustomUrlToggle(event) {
        this.editingCustomUrlEnabled = event.target.checked;
        if (!this.editingCustomUrlEnabled) {
            this.editingCustomUrl = "";
        }
    }

    handleCustomUrlInput(event) {
        this.editingCustomUrl = event.target.value;
    }

    handleSaveEdit() {
        if (this._editingIndex < 0) return;
        const updated = [...this._selected];
        updated[this._editingIndex] = {
            apiName: this._editingApiName,
            label: this._editingLabel,
            publiclyAvailable: this.editingPubliclyAvailable,
            customUrl: this.editingCustomUrlEnabled ? this.editingCustomUrl : ""
        };
        this._selected = updated;
        this.showEditor = false;
        this._editingIndex = -1;
        this._dispatch();
    }

    handleCancelEdit() {
        this.showEditor = false;
        this._editingIndex = -1;
    }

    // ── Drag-and-drop reorder ────────────────────────────────────────────────

    handleDragStart(event) {
        this._dragSrcApiName = event.currentTarget.dataset.api;
        event.dataTransfer.effectAllowed = "move";
    }

    handleDragOver(event) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
    }

    handleDrop(event) {
        event.preventDefault();
        const targetApiName = event.currentTarget.dataset.api;
        if (!this._dragSrcApiName || this._dragSrcApiName === targetApiName) return;

        const from = this._selected.findIndex((o) => o.apiName === this._dragSrcApiName);
        const to = this._selected.findIndex((o) => o.apiName === targetApiName);
        if (from < 0 || to < 0) return;

        const reordered = [...this._selected];
        const [moved] = reordered.splice(from, 1);
        reordered.splice(to, 0, moved);
        this._selected = reordered;
        this._dragSrcApiName = null;
        this._dispatch();
    }

    // ── Dispatch ─────────────────────────────────────────────────────────────

    _dispatch() {
        this.dispatchEvent(
            new CustomEvent("valuechange", {
                detail: { value: JSON.stringify(this._selected) }
            })
        );
    }
}
