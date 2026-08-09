import React from 'react';

function Field({ label, value }) {
    return (
        <div>
            <strong>{label}:</strong> {value}
        </div>
    );
}

function UserInfo({ customer }) {
    // Tüm görüşmeler için static varsayılanlar
    const DEFAULT_CUSTOMER = {
        name: 'Ali Yılmaz',
        tc: '17845783987',
        dob: '24/06/2000',
        gender: 'M',
        nationality: 'Tr',
    };

    // Gerçek veri gelirse defaultların üstüne yaz
    const c = { ...DEFAULT_CUSTOMER, ...(customer || {}) };

    return (
        <div className="shadow-sm p-3 mb-4 d-flex align-items-center flex-row gap-4 rounded-4">
            <div
                className="rounded-circle bg-secondary d-flex align-items-center justify-content-center"
                style={{ width: 60, height: 60 }}
            >
                <i className="bi bi-person-fill text-white fs-3"></i>
            </div>

            <div className="d-flex flex-wrap gap-4 align-items-center">
                <Field label="Adı Soyadı" value={c.name} />
                <Field label="Kimlik No" value={c.tc} />
                <Field label="Doğum Tarihi" value={c.dob} />
                <Field label="Cinsiyet" value={c.gender} />
                <Field label="Uyruk" value={c.nationality} />
            </div>
        </div>
    );
}

export default UserInfo;
