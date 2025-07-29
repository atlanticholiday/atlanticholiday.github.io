import { Config } from './config.js';

export class PDFGenerator {
    constructor() {
        this.calculateHoursFromShift = this.calculateHoursFromShift.bind(this);
    }

    generateTeamReportPDF(dataManager) {
        try {
            const { jsPDF } = window.jspdf;
            if (!jsPDF) {
                console.error('jsPDF library not loaded');
                return;
            }

            const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

            const month = dataManager.getCurrentDate().getMonth();
            const year = dataManager.getCurrentDate().getFullYear();
            const monthName = Config.MONTHS_OF_YEAR[month];

            doc.setFontSize(18);
            doc.text("Atlantic Holiday", 14, 22);
            doc.setFontSize(14);
            doc.text(`Monthly Team Work Report`, 14, 30);
            doc.setFontSize(11);
            doc.setTextColor(100);
            doc.text(`Period: ${monthName} ${year}`, 14, 36);

            const tableData = dataManager.getActiveEmployees().map(emp => {
                let workDays = 0;
                let vacationDays = 0;
                let extraHoursTotal = 0;
                let extraHoursDetails = [];

                const daysInMonth = new Date(year, month + 1, 0).getDate();
                for (let day = 1; day <= daysInMonth; day++) {
                    const date = new Date(year, month, day);
                    const status = dataManager.getEmployeeStatusForDate(emp, date);
                    const dateKey = dataManager.getDateKey(date);
                    
                    if (status === 'Working') workDays++;
                    if (status === 'On Vacation') vacationDays++;
                    
                    if (emp.extraHours && emp.extraHours[dateKey]) {
                        const hours = emp.extraHours[dateKey];
                        extraHoursTotal += hours;
                        extraHoursDetails.push(`- Day ${day}: ${hours} hrs`);
                    }
                }
                
                return [
                    emp.name,
                    workDays,
                    vacationDays,
                    extraHoursTotal.toFixed(1),
                    extraHoursDetails.join('\n')
                ];
            });

            doc.autoTable({
                head: [['Employee', 'Work Days', 'Vacation Days', 'Total Extra Hrs', 'Extra Hours Details']],
                body: tableData,
                startY: 42,
                theme: 'grid',
                headStyles: { fillColor: [233, 75, 90] },
                styles: { cellPadding: 2, fontSize: 8 },
                columnStyles: {
                    0: { cellWidth: 30 },
                    1: { cellWidth: 18, halign: 'center' },
                    2: { cellWidth: 22, halign: 'center' },
                    3: { cellWidth: 25, halign: 'center' },
                    4: { cellWidth: 'auto' },
                }
            });

            // Add signature section for team report
            let signatureY = doc.lastAutoTable.finalY + 15;
            const pageHeight = 297; // A4 height in mm
            
            // Ensure signature fits on the page
            if (signatureY > pageHeight - 30) {
                signatureY = pageHeight - 30;
            }

            // Signature section
            doc.setLineWidth(0.5);
            doc.line(14, signatureY, 80, signatureY); // Signature line
            doc.setFontSize(9);
            doc.setTextColor(100);
            doc.text("Manager Signature", 14, signatureY + 4);
            
            // Add date line below signature
            doc.line(14, signatureY + 8, 50, signatureY + 8);
            doc.text("Date", 14, signatureY + 12);

            const filename = `Team_Report_${monthName}_${year}.pdf`;
            doc.save(filename);
            console.log('Team PDF generated successfully:', filename);
            
        } catch (error) {
            console.error('Error generating team PDF:', error);
            alert('Error generating team PDF. Please try again.');
        }
    }

    generateIndividualReportPDF(employeeId, dataManager) {
        try {
            const emp = dataManager.getActiveEmployees().find(e => e.id === employeeId);
            if (!emp) {
                console.error('Employee not found:', employeeId);
                return;
            }

            const { jsPDF } = window.jspdf;
            if (!jsPDF) {
                console.error('jsPDF library not loaded');
                return;
            }

            const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
            
            const month = dataManager.getCurrentDate().getMonth();
            const year = dataManager.getCurrentDate().getFullYear();
            const monthName = Config.MONTHS_OF_YEAR[month];

            // Header
            doc.setFontSize(18);
            doc.text("Monthly Hours Report", 14, 22);
            doc.setFontSize(11);
            doc.setTextColor(100);
            doc.text(`Employee: ${emp.name}`, 14, 30);
            doc.text(`Staff Number: ${emp.staffNumber || 'N/A'}`, 14, 36);
            doc.text(`Period: ${monthName} ${year}`, 14, 42);
            
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const tableData = [];
            let weeklyTotals = [];
            let currentWeekHours = 0;
            let monthlyTotal = 0;
            
            for (let day = 1; day <= daysInMonth; day++) {
                const date = new Date(year, month, day);
                const dayOfWeek = date.getDay();

                if (dataManager.getEmployeeStatusForDate(emp, date) === 'Working') {
                    const shift = (emp.shifts && emp.shifts[dayOfWeek]) || (emp.shifts && emp.shifts.default) || '9:00-18:00';
                    const hours = this.calculateHoursFromShift(shift);
                    currentWeekHours += hours;
                    monthlyTotal += hours;

                    tableData.push([
                        date.toLocaleDateString(),
                        Config.DAYS_OF_WEEK[dayOfWeek],
                        shift,
                        hours.toFixed(1)
                    ]);
                }

                if (dayOfWeek === 6 || day === daysInMonth) {
                    if (currentWeekHours > 0) {
                        weeklyTotals.push(currentWeekHours);
                    }
                    currentWeekHours = 0;
                }
            }

            // Main table with reduced font size to fit more content
            doc.autoTable({
                head: [['Date', 'Day', 'Shift', 'Hours Worked']],
                body: tableData,
                startY: 48,
                theme: 'grid',
                headStyles: { fillColor: [233, 75, 90] },
                styles: { cellPadding: 1.5, fontSize: 8, halign: 'center' },
                columnStyles: {
                    0: { cellWidth: 25 },
                    1: { cellWidth: 20 },
                    2: { cellWidth: 30 },
                    3: { cellWidth: 25 }
                }
            });
            
            let finalY = doc.lastAutoTable.finalY + 8;
            
            // Summary section with smaller spacing
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text('Summary', 14, finalY);
            
            let summaryBody = [];
            weeklyTotals.forEach((hours, i) => {
                summaryBody.push([`Week ${i+1} Total`, `${hours.toFixed(1)} hours`]);
            });
            summaryBody.push(['Monthly Total', `${monthlyTotal.toFixed(1)} hours`]);
            
            doc.autoTable({
                body: summaryBody,
                startY: finalY + 2,
                theme: 'plain',
                styles: { fontSize: 9, cellPadding: 1 },
                columnStyles: { 0: { fontStyle: 'bold' } }
            });

            // Calculate signature position to ensure it fits on the page
            let signatureY = doc.lastAutoTable.finalY + 15;
            const pageHeight = 297; // A4 height in mm
            const signatureHeight = 20; // Space needed for signature
            
            // If signature would go off the page, adjust the layout
            if (signatureY + signatureHeight > pageHeight - 10) {
                // Reduce spacing and move signature up
                signatureY = pageHeight - 30;
                
                // If still too much content, reduce table rows or font size
                if (signatureY < doc.lastAutoTable.finalY + 10) {
                    // Force signature position and let it overlap if necessary
                    signatureY = doc.lastAutoTable.finalY + 5;
                }
            }

            // Signature section
            doc.setLineWidth(0.5);
            doc.line(14, signatureY, 80, signatureY); // Signature line
            doc.setFontSize(9);
            doc.setTextColor(100);
            doc.text("Employee Signature", 14, signatureY + 4);
            
            // Add date line below signature
            doc.line(14, signatureY + 8, 50, signatureY + 8);
            doc.text("Date", 14, signatureY + 12);

            const filename = `Hours_Report_${emp.name.replace(' ','_')}_${monthName}_${year}.pdf`;
            doc.save(filename);
            console.log('PDF generated successfully:', filename);
            
        } catch (error) {
            console.error('Error generating PDF:', error);
            alert('Error generating PDF. Please try again.');
        }
    }

    calculateHoursFromShift(shift) {
        if (!shift) return 0;
        try {
            const [start, end] = shift.split('-').map(time => parseInt(time.split(':')[0]));
            if(isNaN(start) || isNaN(end)) return 0;
            const totalHours = end - start;
            return totalHours > 1 ? totalHours - 1 : totalHours;
        } catch {
            return 8; 
        }
    }
} 