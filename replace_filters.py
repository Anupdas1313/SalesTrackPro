import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# The start marker
start_marker = "<!-- Filter, Search & Timeline Toolbar (Distraction-Free, Mobile-First UX) -->"
# The end marker - it's the end of the showMobileFilters block.
# Right after that modal is the <div v-if="filteredMyFiles.length === 0"
end_marker = """<div v-if="filteredMyFiles.length === 0" class="flex flex-col items-center justify-center py-16 px-4 bg-white rounded-3xl border border-slate-200/80 shadow-sm text-center">"""

new_block = '''<!-- Filter, Search & Sort Toolbar (Minimal Desktop-like UX) -->
                        <div class="bg-white p-3 sm:p-4 rounded-2xl shadow-sm border border-slate-200/80 mb-5 flex flex-col md:flex-row flex-wrap gap-3 sm:gap-4 items-start md:items-end">
                            
                            <!-- Search -->
                            <div class="flex-1 w-full md:min-w-[200px]">
                                <label class="block text-[10px] text-slate-500 font-bold mb-1.5 uppercase tracking-wider">Search</label>
                                <div class="relative">
                                    <i class="fas fa-search absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                                    <input v-model="roFilters.search" @input="roFilters.search = .target.value.toUpperCase()" type="text" placeholder="Name, ID, SM..." class="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold uppercase outline-none focus:bg-white focus:border-[#97144D] focus:ring-2 focus:ring-[#97144D]/10 transition">
                                </div>
                            </div>

                            <!-- Status Filter -->
                            <div class="w-full md:w-[130px]">
                                <label class="block text-[10px] text-slate-500 font-bold mb-1.5 uppercase tracking-wider">Status</label>
                                <select v-model="roFilters.status" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:bg-white focus:border-[#97144D] focus:ring-2 focus:ring-[#97144D]/10 transition appearance-none cursor-pointer">
                                    <option value="">All Statuses</option>
                                    <option value="Lead">Lead</option>
                                    <option value="FI">FI</option>
                                    <option value="FCU">FCU</option>
                                    <option value="UW">UW</option>
                                    <option value="Approved">Approved</option>
                                    <option value="Rejected">Rejected</option>
                                    <option value="Disbursed">Disbursed</option>
                                    <option value="Cancelled">Cancelled</option>
                                    <option value="Custom">Custom</option>
                                </select>
                            </div>

                            <!-- Timeline Filter -->
                            <div class="w-full md:w-[120px]">
                                <label class="block text-[10px] text-slate-500 font-bold mb-1.5 uppercase tracking-wider">Timeline</label>
                                <select v-model="roFilters.timeline" @change="roFilters.timeline !== 'custom' ? roFilters.customDate = '' : null" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:bg-white focus:border-[#97144D] focus:ring-2 focus:ring-[#97144D]/10 transition appearance-none cursor-pointer">
                                    <option value="all">All Time</option>
                                    <option value="today">Today</option>
                                    <option value="yesterday">Yesterday</option>
                                    <option value="this-week">This Week</option>
                                    <option value="this-month">This Month</option>
                                    <option value="custom">Custom Date</option>
                                </select>
                            </div>

                            <!-- Custom Date Input -->
                            <div v-if="roFilters.timeline === 'custom'" class="w-full md:w-[120px]">
                                <label class="block text-[10px] text-slate-500 font-bold mb-1.5 uppercase tracking-wider">Select Date</label>
                                <input v-model="roFilters.customDate" type="date" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:bg-white focus:border-[#97144D] focus:ring-2 focus:ring-[#97144D]/10 transition">
                            </div>

                            <!-- Category Filter -->
                            <div class="w-full md:w-[90px]">
                                <label class="block text-[10px] text-slate-500 font-bold mb-1.5 uppercase tracking-wider">Category</label>
                                <select v-model="roFilters.nclUcl" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:bg-white focus:border-[#97144D] focus:ring-2 focus:ring-[#97144D]/10 transition appearance-none cursor-pointer">
                                    <option value="">All</option>
                                    <option value="NCL">NCL</option>
                                    <option value="UCL">UCL</option>
                                </select>
                            </div>

                            <!-- Channel Filter -->
                            <div class="w-full md:w-[90px]">
                                <label class="block text-[10px] text-slate-500 font-bold mb-1.5 uppercase tracking-wider">Channel</label>
                                <select v-model="roFilters.sourcingChannel" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:bg-white focus:border-[#97144D] focus:ring-2 focus:ring-[#97144D]/10 transition appearance-none cursor-pointer">
                                    <option value="">All</option>
                                    <option value="DSA">DSA</option>
                                    <option value="Branch">Branch</option>
                                </select>
                            </div>

                            <!-- Sort By -->
                            <div class="w-full md:w-[110px]">
                                <label class="block text-[10px] text-slate-500 font-bold mb-1.5 uppercase tracking-wider">Sort</label>
                                <select v-model="roFilters.sortBy" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:bg-white focus:border-[#97144D] focus:ring-2 focus:ring-[#97144D]/10 transition appearance-none cursor-pointer">
                                    <option value="newest">Newest First</option>
                                    <option value="oldest">Oldest First</option>
                                </select>
                            </div>

                            <!-- Actions -->
                            <div class="w-full md:w-auto flex items-center gap-2 mt-1 md:mt-0">
                                <button @click="resetRoFilters" v-if="roFilters.search || roFilters.status || roFilters.nclUcl || roFilters.sourcingChannel || roFilters.timeline !== 'all' || roFilters.sortBy !== 'newest'" class="px-3 py-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition text-xs font-bold" title="Clear Filters">
                                    <i class="fas fa-undo"></i>
                                </button>
                                <button @click="exportRoFilesToExcel" class="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-[#97144D] text-white rounded-xl hover:bg-[#801140] transition shadow-sm text-xs font-bold">
                                    <i class="fas fa-file-excel"></i>
                                    <span>Export</span>
                                </button>
                            </div>
                        </div>

                        '''

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx != -1 and end_idx != -1:
    new_content = content[:start_idx] + new_block + content[end_idx:]
    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Successfully replaced toolbar.")
else:
    print(f"Could not find markers. Start: {start_idx}, End: {end_idx}")

