import { Config } from './config.js';

export class PDFGenerator {
    constructor() {
        this.calculateHoursFromShift = this.calculateHoursFromShift.bind(this);
    }

    generateTeamReportPDF(dataManager) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

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
            styles: { cellPadding: 2.5, fontSize: 9 },
            columnStyles: {
                0: { cellWidth: 35 },
                1: { cellWidth: 20, halign: 'center' },
                2: { cellWidth: 25, halign: 'center' },
                3: { cellWidth: 28, halign: 'center' },
                4: { cellWidth: 'auto' },
            }
        });

        doc.save(`Team_Report_${monthName}_${year}.pdf`);
    }

    generateIndividualReportPDF(employeeId, dataManager) {
        const emp = dataManager.getActiveEmployees().find(e => e.id === employeeId);
        if (!emp) return;

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
        
        const month = dataManager.getCurrentDate().getMonth();
        const year = dataManager.getCurrentDate().getFullYear();
        const monthName = Config.MONTHS_OF_YEAR[month];

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

        doc.autoTable({
            head: [['Date', 'Day', 'Shift', 'Hours Worked']],
            body: tableData,
            startY: 48,
            theme: 'grid',
            headStyles: { fillColor: [233, 75, 90] },
            styles: { cellPadding: 2, fontSize: 9, halign: 'center' },
        });
        
        let finalY = doc.lastAutoTable.finalY + 10;
        
        doc.setFontSize(12);
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
            styles: { fontSize: 10, cellPadding: 1.5 },
            columnStyles: { 0: { fontStyle: 'bold' } }
        });

        let signatureY = doc.lastAutoTable.finalY + 20;
        if (signatureY > 270) { // Ensure it doesn't go off the page
            signatureY = 270;
        }

        doc.setLineWidth(0.5);
        doc.line(14, signatureY, 80, signatureY); // Signature line
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text("Employee Signature", 14, signatureY + 5);

        doc.save(`Hours_Report_${emp.name.replace(' ','_')}_${monthName}_${year}.pdf`);
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