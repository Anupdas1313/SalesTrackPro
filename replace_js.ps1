 = Get-Content js/app.js -Raw
 =  -replace '(?s)\s*const showMobileFilters = ref\(false\);\s*const showCustomDateInput = ref\(false\);\s*const mySearch = ref\(''\);', ''
 =  -replace '(?s)\s*const activeFilterCount = computed\(\(\) => \{.*?(?=\s*const timelineCounts)', ''
 =  -replace '(?s)\s*const timelineCounts = computed\(\(\) => \{.*?(?=\s*const getSortLabel)', ''
 =  -replace 'const q = \(roFilters\.value\.search \|\| mySearch\.value\)\.trim\(\)\.toLowerCase\(\);', 'const q = roFilters.value.search.trim().toLowerCase();'
 =  -replace ' showMobileFilters,', ''
 =  -replace ' showCustomDateInput, activeFilterCount, timelineCounts, mySearch,', ''

[IO.File]::WriteAllText("c:\workproject\js\app.js", )
"Success"
