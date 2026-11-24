const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const source = fs.readFileSync(path.join(__dirname, '../js/admin.js'), 'utf8');
const apiCode = source.slice(source.indexOf('    function api('), source.indexOf('    function formJson('));
const companyCode = source.slice(source.indexOf('    function initCompanyPage('), source.indexOf('    function initAdminHome('));
async function checkResponse(response, expected, field) {
    const context = {state: {csrfToken: 'test'}, window: {apiUrl: p => p}, FormData: class {}, fetch: async () => response};
    vm.createContext(context); vm.runInContext(apiCode, context);
    await assert.rejects(context.api('/api/admin/company-settings'), error => {
        assert.match(error.message, expected);
        if (field) assert.equal(error.field, field);
        return true;
    });
}
class Node {
    constructor() { this.events = {}; this.attrs = {}; this.classList = {add() {}, remove() {}}; }
    addEventListener(name, fn) { this.events[name] = fn; }
    setAttribute(name, value) { this.attrs[name] = value; }
    focus() { this.focused = true; }
    scrollIntoView() { this.scrolled = true; }
    querySelectorAll() { return []; }
}
(async () => {
    await checkResponse({ok:false,status:400,statusText:'Bad Request',text:async()=>JSON.stringify({message:'Call number is invalid.',field:'phone'})}, /Call number/, 'phone');
    await checkResponse({ok:false,status:400,statusText:'Bad Request',text:async()=>'<html>Bad Request</html>'}, /HTTP 400 Bad Request/);
    await checkResponse({ok:false,status:400,statusText:'Bad Request',text:async()=>''}, /HTTP 400 Bad Request/);
    await checkResponse({ok:true,status:200,statusText:'OK',text:async()=>'<html>Unexpected login page</html>'}, /did not return an API error message/);
    const nodes = Object.fromEntries(['companyForm','companyStatus','uploadCompanyLogo','companyLogoFile'].map(id => [id,new Node()]));
    const phone = new Node(), saveButton = new Node(), logo = new Node();
    nodes.companyForm.elements = {logo, namedItem: () => phone};
    nodes.companyForm.querySelector = () => saveButton;
    nodes.companyLogoFile.files = [];
    const storedLogo = '/img/uploads/articles/logo.png';
    let initialized, rejectSave = true, preview, brandLogo;
    const uploadedLogo = '/img/uploads/articles/new-logo.png';
    const context = {
        byId: id => nodes[id], initProtectedPage: fn => { initialized = fn(); },
        setStatus: (node, message, type) => { node.textContent = message; node.statusType = type; },
        formJson: () => ({logo: logo.value}),
        uploadImage: async file => {
            assert.equal(file.name, 'logo.png');
            return {url: uploadedLogo};
        },
        renderImagePreview: url => { preview = url; },
        showAdminLogo: url => { brandLogo = url; },
        api: (route, options) => {
            if (!options) return Promise.resolve({settings:{logo: storedLogo}});
            if (!rejectSave) {
                assert.deepEqual(JSON.parse(options.body), {logo: uploadedLogo});
                return Promise.resolve({settings:{logo: uploadedLogo}});
            }
            assert.deepEqual(JSON.parse(options.body), {});
            return Promise.reject(Object.assign(new Error('Invalid call number.'), {field:'phone'}));
        }
    };
    vm.createContext(context); vm.runInContext(companyCode, context); context.initCompanyPage(); await initialized;
    assert.equal(logo.value, storedLogo);
    nodes.companyForm.events.submit({preventDefault() {}});
    await new Promise(resolve => setImmediate(resolve));
    const status = nodes.companyStatus;
    assert.equal(status.textContent,'Invalid call number.'); assert.equal(status.statusType,'error');
    assert.equal(status.attrs.role,'alert'); assert.equal(status.focused,true); assert.equal(status.scrolled,true);
    assert.equal(phone.attrs['aria-invalid'],'true');
    assert.equal(preview, storedLogo);
    assert.equal(brandLogo, storedLogo);
    rejectSave = false;
    nodes.companyLogoFile.files = [{name: 'logo.png'}];
    nodes.companyForm.events.submit({preventDefault() {}});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(logo.value, uploadedLogo);
    assert.equal(preview, uploadedLogo);
    assert.equal(brandLogo, uploadedLogo);
    assert.equal(status.statusType, 'success');
    console.log('Company error checks passed: JSON/HTML/empty errors, visible save error, focus/scroll and invalid field.');
})();
