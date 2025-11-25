(() => {
    // Aggregate parser helpers; individual parser modules extend window.Parsers.
    window.Parsers = Object.assign(window.Parsers || {}, {
        identifyFileType: window.Helpers.identifyFileType
    });
})();
